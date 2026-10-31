import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ChannelsService } from './channels.service.js';

const SERVER = '00000000-0000-7000-8000-000000000001';
const ACTOR = '00000000-0000-7000-8000-000000000002';
const CHANNEL = '00000000-0000-7000-8000-000000000003';
const CATEGORY = '00000000-0000-7000-8000-000000000004';

/**
 * TG.10: unit test phần move channel + topic của ChannelsService (Prisma giả) — kiểm chèn
 * cuối (sinh rank), dùng positionKey của client, rebalance khi cạn khoảng và về vùng mặc định.
 */

const serverChannel = (overrides: Record<string, unknown> = {}) => ({
  id: CHANNEL,
  serverId: SERVER,
  name: 'general',
  type: 'TEXT',
  position: 0,
  dmKey: null,
  categoryId: null,
  positionKey: null,
  topic: null,
  createdAt: new Date('2026-10-29T00:00:00Z'),
  ...overrides,
});

function makePrisma() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    channel: {
      aggregate: vi.fn().mockResolvedValue({ _max: { position: 3 } }),
      findMany: vi.fn().mockResolvedValue([]),
      // Hàng trả về đủ shape channel server (toChannelDto đọc createdAt).
      update: vi.fn().mockImplementation(async ({ where, data }) => ({
        ...serverChannel(),
        id: where.id,
        ...data,
      })),
    },
    channelCategory: {
      findFirst: vi.fn().mockResolvedValue({ id: CATEGORY, serverId: SERVER }),
    },
  };
  const prisma = {
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (client: typeof tx) => unknown)(tx) : Promise.all([]),
    ),
    channel: {
      ...tx.channel,
      // getChannel() ở ngoài transaction (chạy trước + sau move).
      findUnique: vi.fn().mockResolvedValue(serverChannel()),
    },
    channelCategory: tx.channelCategory,
  };
  return {
    prisma: prisma as unknown as PrismaService,
    tx,
    // Bản raw (vi.fn() thật) để test đè findUnique mà không lọt qua kiểu PrismaService.
    raw: prisma,
  };
}

function makeService() {
  const { prisma, tx, raw } = makePrisma();
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const realtime = { emitToServer: vi.fn() };
  const service = new ChannelsService(
    prisma,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
  );
  return { service, tx, audit, realtime, raw };
}

describe('ChannelsService.move (TG.10)', () => {
  it('không có positionKey → chèn CUỐI category đích: rank sau kênh cuối của nhóm', async () => {
    const { service, tx, realtime } = makeService();
    // Lần 1 (trong tx): kênh khác trong nhóm đích có rank 'm' (chính kênh đang di chuyển bị loại).
    // Lần 2 (sau tx): danh sách nhóm đích sau khi move — gồm cả kênh vừa vào.
    tx.channel.findMany
      .mockResolvedValueOnce([{ id: 'x1', positionKey: 'm' }])
      .mockResolvedValueOnce([
        { id: 'x1', positionKey: 'm' },
        { id: CHANNEL, positionKey: 'n' },
      ]);
    await service.move(CHANNEL, ACTOR, { categoryId: CATEGORY });
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: CHANNEL },
      data: { categoryId: CATEGORY, positionKey: 'n' },
    });
    // Event room server: thứ tự mới của nhóm đích (x1 trước, kênh vừa vào sau).
    expect(realtime.emitToServer).toHaveBeenCalledWith(SERVER, 'channel.reordered', {
      serverId: SERVER,
      scope: 'category',
      categoryId: CATEGORY,
      channelIds: ['x1', CHANNEL],
    });
  });

  it('có positionKey từ UI → dùng nguyên giá trị (server chỉ kiểm hình thức ở zod)', async () => {
    const { service, tx } = makeService();
    await service.move(CHANNEL, ACTOR, { categoryId: CATEGORY, positionKey: 'k' });
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: CHANNEL },
      data: { categoryId: CATEGORY, positionKey: 'k' },
    });
    // Không tra "kênh cuối" khi client đã đưa rank (query sau tx chỉ lấy danh sách nhóm để
    // phát event — không có filter positionKey).
    const traKênhCuối = tx.channel.findMany.mock.calls.some(
      (call) => (call[0] as { where: { positionKey?: unknown } }).where.positionKey !== undefined,
    );
    expect(traKênhCuối).toBe(false);
  });

  it('rankAfter cạn khoảng (kênh cuối là chuỗi rỗng — dữ liệu lệch) → rebalance gán đều cả nhóm, kênh di chuyển nối cuối', async () => {
    const { service, tx } = makeService();
    tx.channel.findMany.mockResolvedValue([{ id: 'x1', positionKey: '' }]);
    await service.move(CHANNEL, ACTOR, { categoryId: CATEGORY });
    // assignRanks(2) = i,r: x1 nhận i, kênh đang di chuyển nối cuối với r.
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: 'x1' },
      data: { positionKey: 'i' },
    });
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: CHANNEL },
      data: { categoryId: CATEGORY, positionKey: 'r' },
    });
  });

  it('categoryId null → về vùng mặc định: position nối cuối (max + 1) dưới khóa create channel', async () => {
    const { service, tx, realtime } = makeService();
    tx.channel.aggregate.mockResolvedValue({ _max: { position: 3 } });
    tx.channel.findMany.mockResolvedValue([{ id: 'd1' }]); // vùng mặc định sau khi move
    const result = await service.move(CHANNEL, ACTOR, { categoryId: null });
    expect(tx.$executeRaw).toHaveBeenCalled(); // advisory lock như POST /channels
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: CHANNEL },
      data: { categoryId: null, positionKey: null, position: 4 },
    });
    expect(realtime.emitToServer).toHaveBeenCalledWith(SERVER, 'channel.reordered', {
      serverId: SERVER,
      scope: 'category',
      categoryId: null,
      channelIds: ['d1'],
    });
    expect(result.categoryId).toBeNull();
  });

  it('category của server khác → 404; channel không tồn tại → 404', async () => {
    const wrongServer = makeService();
    wrongServer.tx.channelCategory.findFirst.mockResolvedValue(null);
    await expect(
      wrongServer.service.move(CHANNEL, ACTOR, { categoryId: CATEGORY }),
    ).rejects.toThrow(NotFoundException);

    const missing = makeService();
    missing.raw.channel.findUnique.mockResolvedValue(null);
    await expect(missing.service.move(CHANNEL, ACTOR, { categoryId: CATEGORY })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ghi audit CHANNEL_REORDER với from/to category', async () => {
    const { service, audit } = makeService();
    await service.move(CHANNEL, ACTOR, { categoryId: CATEGORY });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: SERVER,
        actorId: ACTOR,
        action: 'CHANNEL_REORDER',
        targetId: CHANNEL,
        metadata: { channelId: CHANNEL, fromCategoryId: null, toCategoryId: CATEGORY },
      }),
    );
  });
});

describe('ChannelsService.setTopic (TG.10)', () => {
  it('đặt topic → lưu và phát channel.updated (DTO đầy đủ); không ghi audit', async () => {
    const { service, audit, realtime } = makeService();
    const result = await service.setTopic(CHANNEL, 'Chủ đề mới');
    expect(result.topic).toBe('Chủ đề mới');
    expect(realtime.emitToServer).toHaveBeenCalledWith(
      SERVER,
      'channel.updated',
      expect.objectContaining({ id: CHANNEL, topic: 'Chủ đề mới' }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('chuỗi rỗng → xóa topic (lưu null)', async () => {
    const { service, tx } = makeService();
    await service.setTopic(CHANNEL, '');
    expect(tx.channel.update).toHaveBeenCalledWith({
      where: { id: CHANNEL },
      data: { topic: null },
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Limits } from '@ping/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CategoriesService } from './categories.service.js';

const SERVER = '00000000-0000-7000-8000-000000000001';
const ACTOR = '00000000-0000-7000-8000-000000000002';

/**
 * TG.10: unit test CategoriesService với Prisma giả (mẫu của bans.service.spec) — kiểm
 * vị trí lexorank khi tạo, reorder (idempotent + nối tiếp + rebalance) và xóa category
 * (kênh về vùng mặc định, không mất kênh).
 */

/** rankBetween của shared là hàm thật; test rebalance đè tạm để giả lập "cạn khoảng". */
vi.mock('@ping/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ping/shared')>();
  return { ...actual, rankBetween: vi.fn(actual.rankBetween) };
});

function makePrisma() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    channelCategory: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'new-cat', ...data })),
      update: vi.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    channel: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    // Cả hai dạng $transaction của Prisma: callback (create/reorder) và mảng promise (remove).
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    channelCategory: tx.channelCategory,
    channel: tx.channel,
  };
  return { prisma: prisma as unknown as PrismaService, tx, prismaRaw: prisma };
}

function makeService() {
  const { prisma, tx } = makePrisma();
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const realtime = { emitToServer: vi.fn() };
  const service = new CategoriesService(
    prisma,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
  );
  return { service, tx, audit, realtime };
}

describe('CategoriesService.create (TG.10)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('danh sách trống → rank đầu; danh sách có cuối → nối sau rank của category cuối', async () => {
    const empty = makeService();
    empty.tx.channelCategory.findMany.mockResolvedValue([]);
    const first = await empty.service.create(SERVER, 'Nhóm A');
    expect(first).toMatchObject({ id: 'new-cat', name: 'Nhóm A', position: 'm' });
    expect(empty.realtime.emitToServer).toHaveBeenCalledWith(SERVER, 'channel.reordered', {
      serverId: SERVER,
      scope: 'categories',
      channelIds: [],
    });

    const appended = makeService();
    appended.tx.channelCategory.findFirst.mockResolvedValue({ id: 'c1', position: 'm' });
    const second = await appended.service.create(SERVER, 'Nhóm B');
    expect(second.position).toBe('n');
    expect(appended.tx.channelCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 'n' }) }),
    );
  });

  it('hai request tạo đồng thời không vượt trần: đếm trong advisory lock', async () => {
    const { service, tx } = makeService();
    tx.channelCategory.count.mockResolvedValue(Limits.MAX_CATEGORIES_PER_SERVER);
    await expect(service.create(SERVER, 'dư')).rejects.toThrow(BadRequestException);
    expect(tx.$executeRaw).toHaveBeenCalled(); // đã kịp giữ lock trước khi đếm
    expect(tx.channelCategory.create).not.toHaveBeenCalled();
  });

  it('rankBetween cạn khoảng (dữ liệu lệch) → gán lại đều toàn bộ rồi nối category mới cuối', async () => {
    const { service, tx } = makeService();
    // Chuỗi rỗng là dữ liệu lệch duy nhất khiến after() trả null.
    tx.channelCategory.findFirst.mockResolvedValue({ id: 'c-last', position: '' });
    tx.channelCategory.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const created = await service.create(SERVER, 'Nhóm C');
    // assignRanks(3) = g,n,t: hai category cũ nhận g/n, category mới nối với t.
    expect(tx.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { position: 'g' } }),
    );
    expect(tx.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c2' }, data: { position: 'n' } }),
    );
    expect(created.position).toBe('t');
  });
});

describe('CategoriesService.reorder (TG.10)', () => {
  beforeEach(() => vi.clearAllMocks());

  const rows = [
    { id: 'a', serverId: SERVER, name: 'A', position: 'm' },
    { id: 'b', serverId: SERVER, name: 'B', position: 'n' },
  ];

  it('đúng thứ tự hiện có → không ghi gì (idempotent, không đánh số lại hàng loạt)', async () => {
    const { service, tx, audit } = makeService();
    tx.channelCategory.findMany.mockResolvedValue(rows);
    const result = await service.reorder(SERVER, ACTOR, { orderedIds: ['a', 'b'] });
    expect(tx.channelCategory.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result.map((category) => category.position)).toEqual(['m', 'n']);
  });

  it('đổi thứ tự → gán rank nối tiếp theo mảng, ghi audit CHANNEL_REORDER', async () => {
    const { service, tx, audit } = makeService();
    tx.channelCategory.findMany.mockResolvedValue(rows);
    const result = await service.reorder(SERVER, ACTOR, { orderedIds: ['b', 'a'] });
    expect(tx.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b' }, data: { position: 'm' } }),
    );
    expect(tx.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a' }, data: { position: 'n' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: SERVER,
        actorId: ACTOR,
        action: 'CHANNEL_REORDER',
        metadata: { categoryIds: ['b', 'a'] },
      }),
      expect.anything(),
    );
    expect(result.map((category) => category.id)).toEqual(['b', 'a']);
  });

  it('rankBetween cạn khoảng → rebalance gán đều cả danh sách (assignRanks)', async () => {
    const shared = await import('@ping/shared');
    vi.mocked(shared.rankBetween).mockReturnValue(null);
    try {
      const { service, tx, audit } = makeService();
      tx.channelCategory.findMany.mockResolvedValue(rows);
      const result = await service.reorder(SERVER, ACTOR, { orderedIds: ['b', 'a'] });
      // assignRanks(2) = i,r — tăng nghiêm ngặt, còn chỗ chèn.
      expect(tx.channelCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b' }, data: { position: 'i' } }),
      );
      expect(tx.channelCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a' }, data: { position: 'r' } }),
      );
      expect(result.map((category) => category.position)).toEqual(['i', 'r']);
      expect(audit.record).toHaveBeenCalled();
    } finally {
      vi.mocked(shared.rankBetween).mockRestore();
    }
  });

  it('thiếu/thừa/trùng id → 400, không ghi gì', async () => {
    const missing = makeService();
    missing.tx.channelCategory.findMany.mockResolvedValue(rows);
    await expect(missing.service.reorder(SERVER, ACTOR, { orderedIds: ['a'] })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      missing.service.reorder(SERVER, ACTOR, { orderedIds: ['a', 'b', 'x'] }),
    ).rejects.toThrow(BadRequestException);
    const duplicate = makeService();
    duplicate.tx.channelCategory.findMany.mockResolvedValue(rows);
    await expect(
      duplicate.service.reorder(SERVER, ACTOR, { orderedIds: ['a', 'a'] }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CategoriesService.remove + rename (TG.10)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('xóa category: kênh về vùng mặc định (categoryId + positionKey null), không mất kênh', async () => {
    const { service, tx, realtime } = makeService();
    tx.channelCategory.findFirst.mockResolvedValue({ id: 'c1', serverId: SERVER, name: 'A' });
    // findMany sau transaction trả danh sách category còn lại.
    tx.channelCategory.findMany.mockResolvedValue([{ id: 'c2' }]);
    const result = await service.remove(SERVER, 'c1');
    expect(result).toEqual({ id: 'c1' });
    expect(tx.channel.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 'c1' },
      data: { categoryId: null, positionKey: null },
    });
    expect(tx.channelCategory.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(realtime.emitToServer).toHaveBeenCalledWith(SERVER, 'channel.reordered', {
      serverId: SERVER,
      scope: 'categories',
      channelIds: ['c2'],
    });
  });

  it('category của server khác gắn vào URL → 404 (không lộ tồn tại)', async () => {
    const remove = makeService();
    remove.tx.channelCategory.findFirst.mockResolvedValue(null);
    await expect(remove.service.remove(SERVER, 'other-server-cat')).rejects.toThrow(
      NotFoundException,
    );
    const rename = makeService();
    rename.tx.channelCategory.findFirst.mockResolvedValue(null);
    await expect(rename.service.rename(SERVER, 'other-server-cat', 'x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('đổi tên → position giữ nguyên, không phát event', async () => {
    const { service, tx, realtime } = makeService();
    tx.channelCategory.findFirst.mockResolvedValue({
      id: 'c1',
      serverId: SERVER,
      name: 'A',
      position: 'm',
    });
    tx.channelCategory.update.mockResolvedValue({ id: 'c1', name: 'B', position: 'm' });
    const result = await service.rename(SERVER, 'c1', 'B');
    expect(result).toEqual({ id: 'c1', name: 'B', position: 'm' });
    expect(realtime.emitToServer).not.toHaveBeenCalled();
  });
});

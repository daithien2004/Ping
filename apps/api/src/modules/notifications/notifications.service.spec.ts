import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

const ME = '00000000-0000-0000-0000-000000000001';
const SERVER = '00000000-0000-0000-0000-00000000000a';
const CHANNEL = '00000000-0000-0000-0000-00000000000b';
const MUTED = '2026-12-01T07:30:00+07:00'; // ISO có offset — đúng hình dạng zod chấp nhận

/** Prisma giả đúng những gì NotificationsService đụng tới. */
function makePrisma() {
  const prisma = {
    server: { findUnique: vi.fn().mockResolvedValue({ id: SERVER }) },
    channel: { findUnique: vi.fn().mockResolvedValue({ id: CHANNEL }) },
    notificationPref: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation((_args: unknown) => {
        // Nhúng "bên trong Prisma": trả dòng như DB sẽ có sau upsert.
        const args = _args as {
          where: { userId_scope_targetId: { userId: string; scope: string; targetId: string } };
          create: Record<string, unknown>;
        };
        return Promise.resolve({
          scope: args.where.userId_scope_targetId.scope,
          targetId: args.where.userId_scope_targetId.targetId,
          level: args.create.level,
          mutedUntil: args.create.mutedUntil,
        });
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

describe('NotificationsService.list (TG.12)', () => {
  it('trả prefs rỗng khi chưa cấu hình gì', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    await expect(service.list(ME)).resolves.toEqual({ prefs: [] });
    expect(prisma.notificationPref.findMany).toHaveBeenCalledWith({
      where: { userId: ME },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('map row → DTO: mutedUntil thành ISO string, scope/level giữ nguyên', async () => {
    const prisma = makePrisma();
    prisma.notificationPref.findMany.mockResolvedValue([
      {
        scope: 'server',
        targetId: SERVER,
        level: 'mentions',
        mutedUntil: new Date('2026-12-01T00:30:00.000Z'),
      },
      { scope: 'channel', targetId: CHANNEL, level: 'all', mutedUntil: null },
    ]);
    const service = new NotificationsService(prisma);
    const res = await service.list(ME);
    expect(res.prefs).toEqual([
      {
        scope: 'server',
        targetId: SERVER,
        level: 'mentions',
        mutedUntil: '2026-12-01T00:30:00.000Z',
      },
      { scope: 'channel', targetId: CHANNEL, level: 'all', mutedUntil: null },
    ]);
  });
});

describe('NotificationsService.setServerPref / setChannelPref (upsert)', () => {
  it('server tồn tại → upsert với unique (userId, scope, targetId); mutedUntil lưu dạng Date', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    const dto = await service.setServerPref(ME, SERVER, { level: 'mentions', mutedUntil: MUTED });
    expect(prisma.notificationPref.upsert).toHaveBeenCalledWith({
      where: { userId_scope_targetId: { userId: ME, scope: 'server', targetId: SERVER } },
      create: {
        userId: ME,
        scope: 'server',
        targetId: SERVER,
        level: 'mentions',
        mutedUntil: new Date(MUTED),
      },
      update: { level: 'mentions', mutedUntil: new Date(MUTED) },
    });
    // ISO có offset chuẩn hóa về UTC khi serialize.
    expect(dto).toEqual({
      scope: 'server',
      targetId: SERVER,
      level: 'mentions',
      mutedUntil: '2026-12-01T00:30:00.000Z',
    });
  });

  it('mutedUntil null → lưu null (không mute)', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    await service.setChannelPref(ME, CHANNEL, { level: 'none', mutedUntil: null });
    expect(prisma.notificationPref.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_scope_targetId: { userId: ME, scope: 'channel', targetId: CHANNEL } },
        create: expect.objectContaining({ mutedUntil: null }),
      }),
    );
  });

  it('upsert 2 lần cùng target → vẫn gọi đúng 1 unique key, không nhân dòng (update dùng lại key)', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    await service.setServerPref(ME, SERVER, { level: 'all', mutedUntil: null });
    await service.setServerPref(ME, SERVER, { level: 'none', mutedUntil: null });
    expect(prisma.notificationPref.upsert).toHaveBeenCalledTimes(2);
    const calls = prisma.notificationPref.upsert.mock.calls;
    for (const [index, expectedLevel] of ['all', 'none'].entries()) {
      const args = calls[index]![0] as { where: object; update: object };
      expect(args.where).toEqual({
        userId_scope_targetId: { userId: ME, scope: 'server', targetId: SERVER },
      });
      expect(args.update).toEqual({ level: expectedLevel, mutedUntil: null });
    }
  });

  it('server/channel không tồn tại → 404, không đụng bảng prefs', async () => {
    const prisma = makePrisma();
    prisma.server.findUnique.mockResolvedValue(null);
    prisma.channel.findUnique.mockResolvedValue(null);
    const service = new NotificationsService(prisma);
    await expect(
      service.setServerPref(ME, SERVER, { level: 'all', mutedUntil: null }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.setChannelPref(ME, CHANNEL, { level: 'all', mutedUntil: null }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.notificationPref.upsert).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.deleteServerPref / deleteChannelPref (idempotent)', () => {
  it('xóa đúng (userId, scope, targetId); count 0 vẫn thành công (204 không lỗi)', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    prisma.notificationPref.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.deleteServerPref(ME, SERVER)).resolves.toBeUndefined();
    expect(prisma.notificationPref.deleteMany).toHaveBeenCalledWith({
      where: { userId: ME, scope: 'server', targetId: SERVER },
    });
    // Lần 2: hàng đã mất (count 0) — vẫn không lỗi (idempotent).
    prisma.notificationPref.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteChannelPref(ME, CHANNEL)).resolves.toBeUndefined();
    expect(prisma.notificationPref.deleteMany).toHaveBeenLastCalledWith({
      where: { userId: ME, scope: 'channel', targetId: CHANNEL },
    });
  });
});

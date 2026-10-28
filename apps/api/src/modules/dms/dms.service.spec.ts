import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { DmsService, dmKeyFor } from './dms.service.js';

// Hai UUID lệch thứ tự từ điển — đủ để kiểm chuẩn hóa min|max (UUIDv7 so sánh theo byte).
const ME = '00000000-0000-0000-0000-000000000001';
const TARGET = '00000000-0000-0000-0000-000000000002';

/** Prisma giả đúng những gì DmsService đụng tới; $transaction chạy thẳng callback với tx giả. */
function makePrisma() {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: TARGET,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
        dmAllow: 'server_members',
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ ok: true }]), // EXISTS giao Member: chung server
    userBlock: { findFirst: vi.fn().mockResolvedValue(null) },
    dmParticipant: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    channel: { create: vi.fn().mockResolvedValue({ id: 'chan-dm' }) },
  };
  const prisma = {
    $transaction: (cb: (client: typeof tx) => unknown) => cb(tx),
    $queryRaw: vi.fn().mockResolvedValue([]), // GET /dms hoặc cặp đã có: rỗng mặc định
    user: { findUnique: vi.fn().mockResolvedValue({ id: TARGET }) },
    userBlock: {
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, tx, prismaRaw: prisma };
}

function codeOf(error: unknown): { status: number; code: string } {
  const response = (error as { getResponse: () => { code: string } }).getResponse();
  const status = (error as { getStatus: () => number }).getStatus();
  return { status, code: response.code };
}

describe('dmKeyFor (chuẩn hóa cặp, ADR-0070 mục 1-2)', () => {
  it('luôn là "min|max" bất kể thứ tự tham số', () => {
    expect(dmKeyFor(ME, TARGET)).toBe(`${ME}|${TARGET}`);
    expect(dmKeyFor(TARGET, ME)).toBe(`${ME}|${TARGET}`);
  });
});

describe('DmsService.create (get-or-create, ADR-0070 mục 2-5)', () => {
  it('tạo channel DM + 2 participant khi đủ điều kiện, trả summary mới', async () => {
    const { prisma, tx } = makePrisma();
    const service = new DmsService(prisma);
    const summary = await service.create(ME, TARGET);
    expect(tx.channel.create).toHaveBeenCalledWith({
      data: { type: 'DM', name: '', dmKey: `${ME}|${TARGET}` },
      select: { id: true },
    });
    expect(tx.dmParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { channelId: 'chan-dm', userId: ME },
        { channelId: 'chan-dm', userId: TARGET },
      ],
    });
    expect(summary).toMatchObject({
      channelId: 'chan-dm',
      partner: { id: TARGET },
      unreadCount: 0,
      lastReadMessageId: null,
      lastMessageAt: null,
    });
  });

  it('cặp đã có → trả channel cũ qua summaries, không tạo gì', async () => {
    const { prisma, prismaRaw, tx } = makePrisma();
    prismaRaw.$queryRaw.mockResolvedValue([
      {
        channelId: 'chan-old',
        lastReadMessageId: 'm1',
        partnerId: TARGET,
        partnerUsername: 'bob',
        partnerDisplayName: 'Bob',
        partnerAvatarUrl: null,
        unreadCount: 3,
        lastMessageAt: new Date('2026-10-29T00:00:00Z'),
      },
    ]);
    const service = new DmsService(prisma);
    const summary = await service.create(ME, TARGET);
    expect(summary).toEqual({
      channelId: 'chan-old',
      partner: { id: TARGET, username: 'bob', displayName: 'Bob', avatarUrl: null },
      unreadCount: 3,
      lastReadMessageId: 'm1',
      lastMessageAt: '2026-10-29T00:00:00.000Z',
    });
    expect(tx.channel.create).not.toHaveBeenCalled();
  });

  it('DM chính mình → 400', async () => {
    const { prisma } = makePrisma();
    await expect(new DmsService(prisma).create(ME, ME)).rejects.toThrow(BadRequestException);
  });

  it('không chung server → 403 DM_BLOCKED', async () => {
    const { prisma, tx } = makePrisma();
    tx.$queryRaw.mockResolvedValue([{ ok: false }]);
    const error = await new DmsService(prisma).create(ME, TARGET).catch((e) => e);
    expect(codeOf(error)).toEqual({ status: 403, code: 'DM_BLOCKED' });
  });

  it('target dmAllow=none → 403 DM_BLOCKED (cùng mã chống dò)', async () => {
    const { prisma, tx } = makePrisma();
    tx.user.findUnique.mockResolvedValue({
      id: TARGET,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      dmAllow: 'none',
    });
    const error = await new DmsService(prisma).create(ME, TARGET).catch((e) => e);
    expect(codeOf(error)).toEqual({ status: 403, code: 'DM_BLOCKED' });
  });

  it.each([
    ['blocker là target', { blockerId: TARGET, blockedId: ME }],
    ['blocker là mình', { blockerId: ME, blockedId: TARGET }],
  ])('bị chặn theo chiều %s → 403 DM_BLOCKED (block hai chiều)', async (_label, row) => {
    const { prisma, tx } = makePrisma();
    tx.userBlock.findFirst.mockResolvedValue(row);
    const error = await new DmsService(prisma).create(ME, TARGET).catch((e) => e);
    expect(codeOf(error)).toEqual({ status: 403, code: 'DM_BLOCKED' });
  });

  it('target không tồn tại → 404', async () => {
    const { prisma, tx } = makePrisma();
    tx.user.findUnique.mockResolvedValue(null);
    await expect(new DmsService(prisma).create(ME, TARGET)).rejects.toThrow(NotFoundException);
  });

  it('trần 10 DM mới/giờ: 10 hàng trong cửa sổ → 429, Retry-After dương', async () => {
    const { prisma, tx } = makePrisma();
    const recent = Array.from({ length: 10 }, (_, i) => ({
      createdAt: new Date(Date.now() - (i + 1) * 60_000), // 1..10 phút trước — còn trong 1 giờ
    }));
    tx.dmParticipant.findMany.mockResolvedValue(recent);
    const error = await new DmsService(prisma).create(ME, TARGET).catch((e) => e);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).getStatus()).toBe(429);
    expect((error as TooManyRequestsError).retryAfterSeconds).toBeGreaterThan(0);
    expect(tx.channel.create).not.toHaveBeenCalled();
  });

  it('10 hàng cũ hơn 1 giờ không chặn: tạo được DM mới', async () => {
    const { prisma, tx } = makePrisma();
    const old = Array.from({ length: 10 }, () => ({
      createdAt: new Date(Date.now() - 2 * 3_600_000),
    }));
    tx.dmParticipant.findMany.mockResolvedValue(old);
    await expect(new DmsService(prisma).create(ME, TARGET)).resolves.toMatchObject({
      channelId: 'chan-dm',
    });
    expect(tx.channel.create).toHaveBeenCalledOnce();
  });

  it('P2002 khi hai request song song → trả channel đã tồn tại thay vì lỗi', async () => {
    const { prisma, tx, prismaRaw } = makePrisma();
    tx.channel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    prismaRaw.$queryRaw
      .mockResolvedValueOnce([]) // lần đầu: chưa có cặp
      .mockResolvedValueOnce([
        {
          channelId: 'chan-winner',
          lastReadMessageId: null,
          partnerId: TARGET,
          partnerUsername: 'bob',
          partnerDisplayName: 'Bob',
          partnerAvatarUrl: null,
          unreadCount: 0,
          lastMessageAt: null,
        },
      ]);
    await expect(new DmsService(prisma).create(ME, TARGET)).resolves.toMatchObject({
      channelId: 'chan-winner',
    });
  });
});

describe('DmsService.block/unblock (ADR-0070 mục 4)', () => {
  it('tự block mình → 400', async () => {
    const { prisma } = makePrisma();
    await expect(new DmsService(prisma).block(ME, ME)).rejects.toThrow(BadRequestException);
  });

  it('block user không tồn tại → 404; block hợp lệ upsert idempotent', async () => {
    const { prisma, prismaRaw } = makePrisma();
    prismaRaw.user.findUnique.mockResolvedValueOnce(null);
    await expect(new DmsService(prisma).block(ME, TARGET)).rejects.toThrow(NotFoundException);
    const service = new DmsService(prisma);
    await service.block(ME, TARGET);
    await service.block(ME, TARGET); // chặn lại người đã chặn không lỗi
    expect(prismaRaw.userBlock.upsert).toHaveBeenCalledTimes(2);
  });

  it('unblock idempotent: gỡ người chưa chặn vẫn thành công (deleteMany)', async () => {
    const { prisma, prismaRaw } = makePrisma();
    prismaRaw.userBlock.deleteMany.mockResolvedValue({ count: 0 });
    await expect(new DmsService(prisma).unblock(ME, TARGET)).resolves.toBeUndefined();
    expect(prismaRaw.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: ME, blockedId: TARGET },
    });
  });
});

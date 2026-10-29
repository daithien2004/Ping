import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Permissions } from '@ping/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { BansService } from './bans.service.js';
import { ServersService } from './servers.service.js';

const SERVER = '00000000-0000-7000-8000-000000000001';
const MOD = '00000000-0000-7000-8000-000000000002'; // người ra lệnh ban
const VICTIM = '00000000-0000-7000-8000-000000000003'; // người bị ban
const MEMBER_ID = '00000000-0000-7000-8000-000000000004'; // hàng Member của nạn nhân
const BAN_ID = '00000000-0000-7000-8000-000000000005';

/** Bối cảnh quyền (AbilityContext) dựng tay — canKickModule thật của shared chạy trên đó. */
const ctx = (userId: string, permissions: bigint, isOwner = false) => ({
  userId,
  isOwner,
  permissions,
});

const MOD_CTX = ctx(MOD, Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS);
const VICTIM_CTX = ctx(VICTIM, Permissions.VIEW_CHANNEL);

/** Prisma giả đúng những gì BansService/ServersService.join đụng tới; $transaction chạy thẳng callback. */
function makePrisma() {
  const tx = {
    member: {
      delete: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      count: vi.fn().mockResolvedValue(0),
    },
    serverBan: {
      create: vi.fn().mockResolvedValue({ id: BAN_ID }),
      delete: vi.fn().mockResolvedValue({ id: BAN_ID }),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: BAN_ID,
        serverId: SERVER,
        userId: VICTIM,
        reason: 'spam',
        createdAt: new Date('2026-10-29T00:00:00Z'),
        user: { id: VICTIM, username: 'victim', displayName: 'Victim', avatarUrl: null },
        bannedBy: { id: MOD, username: 'mod', displayName: 'Mod' },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'everyone-role' }) },
    serverInvite: {
      findUnique: vi.fn().mockResolvedValue({
        revokedAt: null,
        expiresAt: null,
        server: { id: SERVER, name: 'S', inviteCode: 'code' },
      }),
    },
  };
  const prisma = {
    // Cả hai dạng $transaction của Prisma: callback (ban) và mảng promise (unban).
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    member: tx.member,
    serverBan: tx.serverBan,
    message: tx.message,
    outboxEvent: tx.outboxEvent,
    role: tx.role,
    serverInvite: tx.serverInvite,
  };
  return { prisma: prisma as unknown as PrismaService, tx, prismaRaw: prisma };
}

function makeDeps(
  contexts: Record<string, { userId: string; isOwner: boolean; permissions: bigint }>,
) {
  const abilityFactory = {
    contextFor: vi.fn(async (serverId: string, userId: string) => contexts[userId]),
    invalidateMember: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const realtime = {
    refreshAccess: vi.fn().mockResolvedValue(undefined),
    emitToServer: vi.fn(),
  };
  return {
    abilityFactory: abilityFactory as unknown as AbilityFactory,
    audit: audit as unknown as AuditService,
    realtime: realtime as unknown as RealtimeService,
  };
}

function makeBansService(
  contexts: Record<string, { userId: string; isOwner: boolean; permissions: bigint }>,
) {
  const { prisma, tx } = makePrisma();
  const deps = makeDeps(contexts);
  const service = new BansService(prisma, deps.abilityFactory, deps.realtime, deps.audit);
  return { service, tx, ...deps, prismaRaw: prisma };
}

function codeOf(error: unknown): { status: number; code?: string } {
  const response = (error as { getResponse: () => { code?: string } }).getResponse();
  return { status: (error as { getStatus: () => number }).getStatus(), code: response.code };
}

describe('BansService.ban (TG.11 — thứ bậc tái dùng canKickMember)', () => {
  it('target không phải member của server → 404', async () => {
    const { service, tx } = makeBansService({ [MOD]: MOD_CTX });
    tx.member.findUnique.mockResolvedValue(null);
    await expect(service.ban(SERVER, MOD, { userId: VICTIM })).rejects.toThrow(NotFoundException);
    // Chặn trước khi đụng tới quyền và transaction.
    expect(tx.serverBan.create).not.toHaveBeenCalled();
  });

  it('tự ban chính mình → 400 (dùng leave)', async () => {
    const { service, tx } = makeBansService({ [MOD]: MOD_CTX });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });
    await expect(service.ban(SERVER, MOD, { userId: MOD })).rejects.toThrow(BadRequestException);
  });

  it('không ban được owner → 403', async () => {
    const owner = '00000000-0000-7000-8000-000000000009';
    const { service, tx } = makeBansService({
      [MOD]: MOD_CTX,
      [owner]: ctx(owner, 0n, true),
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });
    await expect(service.ban(SERVER, MOD, { userId: owner })).rejects.toThrow(ForbiddenException);
    expect(tx.member.delete).not.toHaveBeenCalled();
  });

  it('không ban được người có quyền nằm ngoài quyền mình → 403 (cùng luật kick)', async () => {
    const stronger = '00000000-0000-7000-8000-00000000000a';
    const { service, tx } = makeBansService({
      [MOD]: MOD_CTX,
      // KICK_MEMBERS + VIEW_AUDIT_LOG: có bit mà moderator không có → canKickMember = false.
      [stronger]: ctx(
        stronger,
        Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS | Permissions.VIEW_AUDIT_LOG,
      ),
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });
    await expect(service.ban(SERVER, MOD, { userId: stronger })).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.member.delete).not.toHaveBeenCalled();
  });

  it('thành công: xóa member + tạo ServerBan + audit SERVER_BAN trong MỘT transaction', async () => {
    const { service, tx, prismaRaw, audit, realtime, abilityFactory } = makeBansService({
      [MOD]: MOD_CTX,
      [VICTIM]: VICTIM_CTX,
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });

    const dto = await service.ban(SERVER, MOD, { userId: VICTIM, reason: 'spam' });

    expect(prismaRaw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.member.delete).toHaveBeenCalledWith({ where: { id: MEMBER_ID } });
    expect(tx.serverBan.create).toHaveBeenCalledWith({
      data: { serverId: SERVER, userId: VICTIM, reason: 'spam', bannedById: MOD },
    });
    expect(audit.record).toHaveBeenCalledWith(
      {
        serverId: SERVER,
        actorId: MOD,
        action: 'SERVER_BAN',
        targetId: BAN_ID,
        metadata: { userId: VICTIM, reason: 'spam' },
      },
      tx,
    );
    // Realtime: event removal (kick pattern) kèm cờ banned + cập nhật members cho room server.
    expect(abilityFactory.invalidateMember).toHaveBeenCalledWith(SERVER, VICTIM);
    expect(realtime.refreshAccess).toHaveBeenCalledWith(SERVER, [VICTIM], { banned: true });
    expect(realtime.emitToServer).toHaveBeenCalledWith(SERVER, 'member.banned', {
      serverId: SERVER,
      userId: VICTIM,
    });
    expect(dto).toMatchObject({
      id: BAN_ID,
      serverId: SERVER,
      userId: VICTIM,
      reason: 'spam',
      bannedBy: { id: MOD, username: 'mod' },
      createdAt: '2026-10-29T00:00:00.000Z',
    });
  });

  it('deleteMessages24h=true: soft-delete đúng các tin 24h gần nhất + đếm vào audit + outbox message.deleted', async () => {
    const { service, tx, audit } = makeBansService({
      [MOD]: MOD_CTX,
      [VICTIM]: VICTIM_CTX,
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });
    tx.message.findMany.mockResolvedValue([
      { id: 'm1', channelId: 'c1' },
      { id: 'm2', channelId: 'c1' },
    ]);

    await service.ban(SERVER, MOD, { userId: VICTIM, deleteMessages24h: true });

    // Query tin: theo author + các channel của server + chưa xóa + trong cửa sổ 24h.
    const where = tx.message.findMany.mock.calls[0][0].where;
    expect(where.authorId).toBe(VICTIM);
    expect(where.channel.serverId).toBe(SERVER);
    expect(where.deletedAt).toBeNull();
    expect(where.createdAt.gte.getTime()).toBeLessThanOrEqual(Date.now() - 24 * 60 * 60 * 1000);
    expect(tx.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: expect.objectContaining({ pinnedAt: null, pinnedById: null }),
    });
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          aggregateType: 'Message',
          aggregateId: 'm1',
          type: 'message.deleted',
          payload: { id: 'm1', channelId: 'c1' },
        },
        {
          aggregateType: 'Message',
          aggregateId: 'm2',
          type: 'message.deleted',
          payload: { id: 'm2', channelId: 'c1' },
        },
      ],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVER_BAN',
        metadata: { userId: VICTIM, deletedMessages: 2 },
      }),
      tx,
    );
  });

  it('deleteMessages24h=false: không đụng message, audit không có deletedMessages', async () => {
    const { service, tx, audit } = makeBansService({
      [MOD]: MOD_CTX,
      [VICTIM]: VICTIM_CTX,
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });

    await service.ban(SERVER, MOD, { userId: VICTIM });

    expect(tx.message.findMany).not.toHaveBeenCalled();
    expect(tx.message.updateMany).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: VICTIM } }),
      tx,
    );
  });

  it('ban trùng (hai request đua qua check member) → 409', async () => {
    const { service, tx } = makeBansService({
      [MOD]: MOD_CTX,
      [VICTIM]: VICTIM_CTX,
    });
    tx.member.findUnique.mockResolvedValue({ id: MEMBER_ID });
    tx.serverBan.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.ban(SERVER, MOD, { userId: VICTIM })).rejects.toThrow(ConflictException);
  });
});

describe('BansService.unban (TG.11)', () => {
  it('có lệnh ban → xóa hàng + audit SERVER_UNBAN', async () => {
    const { service, tx, prismaRaw, audit } = makeBansService({});
    tx.serverBan.findUnique.mockResolvedValue({ id: BAN_ID });

    await service.unban(SERVER, MOD, VICTIM);

    expect(prismaRaw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.serverBan.delete).toHaveBeenCalledWith({ where: { id: BAN_ID } });
    expect(audit.record).toHaveBeenCalledWith({
      serverId: SERVER,
      actorId: MOD,
      action: 'SERVER_UNBAN',
      targetId: BAN_ID,
      metadata: { userId: VICTIM },
    });
  });

  it('không có lệnh ban → 404 (nhất quán với kick/xóa tin đã mất của repo)', async () => {
    const { service, tx } = makeBansService({});
    tx.serverBan.findUnique.mockResolvedValue(null);
    await expect(service.unban(SERVER, MOD, VICTIM)).rejects.toThrow(NotFoundException);
    expect(tx.serverBan.delete).not.toHaveBeenCalled();
  });
});

describe('BansService.list (TG.11)', () => {
  it('mới nhất trước, hasMore đúng, shape đủ user + reason + bannedBy + createdAt', async () => {
    const { service, tx } = makeBansService({});
    const rows = [
      {
        id: 'ban-2',
        serverId: SERVER,
        userId: VICTIM,
        reason: null,
        createdAt: new Date('2026-10-29T02:00:00Z'),
        user: { id: VICTIM, username: 'victim', displayName: 'Victim', avatarUrl: null },
        bannedBy: { id: MOD, username: 'mod', displayName: 'Mod' },
      },
    ];
    // limit 1: lấy dư một hàng → hasMore = true, trang chỉ giữ dòng mới nhất.
    tx.serverBan.findMany.mockResolvedValue([...rows, { id: 'ban-1' }]);

    const page = await service.list(SERVER, { limit: 1 });

    expect(tx.serverBan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'desc' }, take: 2 }),
    );
    expect(page.hasMore).toBe(true);
    expect(page.bans).toHaveLength(1);
    expect(page.bans[0]).toMatchObject({
      id: 'ban-2',
      reason: null,
      user: { username: 'victim' },
      bannedBy: { username: 'mod' },
      createdAt: '2026-10-29T02:00:00.000Z',
    });
  });
});

describe('ServersService.join — chặn người bị ban (TG.11)', () => {
  function makeJoinService(prisma: PrismaService) {
    const deps = makeDeps({});
    return new ServersService(
      prisma,
      deps.abilityFactory,
      deps.realtime,
      deps.audit,
      null as never, // attachments: join không đụng
    );
  }

  it('đã bị ban ở server này → 403 BANNED, không tạo member', async () => {
    const { prisma, tx } = makePrisma();
    tx.serverBan.findUnique.mockResolvedValue({ id: BAN_ID });
    const service = makeJoinService(prisma);

    const error = await service.join(VICTIM, 'code').catch((e: unknown) => e);
    expect(codeOf(error)).toEqual({ status: 403, code: 'BANNED' });
    expect(tx.member.create).not.toHaveBeenCalled();
  });

  it('không bị ban → đi tiếp và tạo member (kiểm tra ban là một tra cứu, không cản đường thường)', async () => {
    const { prisma, tx } = makePrisma();
    tx.member.create.mockResolvedValue({
      id: MEMBER_ID,
      roles: [],
    });
    const service = makeJoinService(prisma);

    const result = await service.join(VICTIM, 'code');
    expect(tx.serverBan.findUnique).toHaveBeenCalled();
    expect(tx.member.create).toHaveBeenCalled();
    expect(result.server).toEqual({ id: SERVER, name: 'S', inviteCode: 'code' });
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canKickMember,
  ServerEvents,
  type CreateBanInput,
  type ListBansQuery,
  type ServerBanDto,
  type ServerBanPage,
} from '@ping/shared';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import type { ServerBan } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const DELETE_MESSAGES_WINDOW_MS = 24 * 60 * 60 * 1000;

// Dùng lại `canKickMember`, KHÔNG copy ra canBanMember (hai bản luật sẽ trôi khỏi nhau); không thêm bit BAN_MEMBERS
// vì ban là kick nặng hơn.
@Injectable()
export class BansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  // Gỡ membership + ServerBan + audit trong MỘT transaction: không có khoảnh khắc đã mất member nhưng chưa bị chặn join.
  async ban(serverId: string, actorId: string, input: CreateBanInput): Promise<ServerBanDto> {
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId: input.userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found in this server');
    }
    if (input.userId === actorId) {
      throw new BadRequestException('You cannot ban yourself');
    }

    const actor = await this.abilityFactory.contextFor(serverId, actorId);
    const target = await this.abilityFactory.contextFor(serverId, input.userId);
    if (!canKickMember(actor, target)) {
      throw new ForbiddenException('You cannot ban this member');
    }

    const since = new Date(Date.now() - DELETE_MESSAGES_WINDOW_MS);
    const ban = await this.prisma.$transaction(async (tx) => {
      await tx.member.delete({ where: { id: member.id } });
      let created: ServerBan;
      try {
        created = await tx.serverBan.create({
          data: {
            serverId,
            userId: input.userId,
            reason: input.reason ?? null,
            bannedById: actorId,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException('This user is already banned from this server');
        }
        throw error;
      }

      // Soft-delete (row phải còn để "tin đã xóa" render); mỗi tin ghi outbox `message.deleted` cùng transaction để indexer dọn.
      let deletedMessages = 0;
      if (input.deleteMessages24h) {
        const victims = await tx.message.findMany({
          where: {
            channel: { serverId },
            authorId: input.userId,
            deletedAt: null,
            createdAt: { gte: since },
          },
          select: { id: true, channelId: true },
        });
        if (victims.length > 0) {
          await tx.message.updateMany({
            where: { id: { in: victims.map((message) => message.id) } },
            data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null },
          });
          await tx.outboxEvent.createMany({
            data: victims.map((message) => ({
              aggregateType: 'Message',
              aggregateId: message.id,
              type: ServerEvents.MessageDeleted,
              payload: { id: message.id, channelId: message.channelId },
            })),
          });
        }
        deletedMessages = victims.length;
      }

      await this.audit.record(
        {
          serverId,
          actorId,
          action: 'SERVER_BAN',
          targetId: created.id,
          metadata: {
            userId: input.userId,
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
            ...(input.deleteMessages24h ? { deletedMessages } : {}),
          },
        },
        tx,
      );
      return created;
    });

    // Cache quyền và socket room của người bị ban phải mất ngay (refreshAccess phát `member.removed` kèm `banned: true`).
    await this.abilityFactory.invalidateMember(serverId, input.userId);
    await this.realtime.refreshAccess(serverId, [input.userId], { banned: true });
    this.realtime.emitToServer(serverId, ServerEvents.MemberBanned, {
      serverId,
      userId: input.userId,
    });

    return this.toDto(ban.id);
  }

  // Không có ban → 404, KHÔNG 204 idempotent: repo coi DELETE trên tài nguyên đã mất là 404.
  async unban(serverId: string, actorId: string, userId: string): Promise<void> {
    const ban = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true },
    });
    if (!ban) {
      throw new NotFoundException('This user is not banned from this server');
    }
    await this.prisma.$transaction([
      this.prisma.serverBan.delete({ where: { id: ban.id } }),
      this.audit.record({
        serverId,
        actorId,
        action: 'SERVER_UNBAN',
        targetId: ban.id,
        metadata: { userId },
      }),
    ]);
  }

  async list(serverId: string, { after, limit }: ListBansQuery): Promise<ServerBanPage> {
    const rows = await this.prisma.serverBan.findMany({
      where: { serverId, ...(after ? { id: { lt: after } } : {}) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        bannedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      bans: page.map((row) => ({
        id: row.id,
        serverId: row.serverId,
        userId: row.userId,
        user: row.user,
        reason: row.reason,
        bannedBy: row.bannedBy,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore,
    };
  }

  private async toDto(banId: string): Promise<ServerBanDto> {
    const row = await this.prisma.serverBan.findUniqueOrThrow({
      where: { id: banId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        bannedBy: { select: { id: true, username: true, displayName: true } },
      },
    });
    return {
      id: row.id,
      serverId: row.serverId,
      userId: row.userId,
      user: row.user,
      reason: row.reason,
      bannedBy: row.bannedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

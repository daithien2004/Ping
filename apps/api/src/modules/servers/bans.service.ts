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

/** Cửa sổ "xóa tin 24 giờ gần nhất" của tùy chọn `deleteMessages24h` (TG.11). */
const DELETE_MESSAGES_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Ban/unban thành viên (TG.11). Guard đã xác nhận caller mang `KICK_MEMBERS`
 * (`create/delete/view ServerBan` trong defineAbilityFor) — KHÔNG thêm bit quyền mới:
 * ban là phiên bản nặng hơn của kick (gỡ membership + chặn join lại) thuộc cùng khối
 * công việc "quản lý thành viên", thêm `BAN_MEMBERS` chỉ phình bitmask mà không tách
 * được nhóm người dùng nó.
 *
 * Thứ bậc theo ĐỐI TƯỢNG tái dùng nguyên `canKickMember` (cùng luật với kick: không
 * đụng owner, không đụng ai có quyền nằm ngoài quyền mình — hierarchy của repo là so
 * tập quyền, không phải `Role.position`). Copy-paste ra `canBanMember` sẽ để hai bản
 * luật trôi dần khỏi nhau.
 */
@Injectable()
export class BansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ban một thành viên: gỡ membership + tạo ServerBan + audit (+ xóa tin 24h nếu tùy chọn)
   * trong MỘT transaction — không có khoảnh khắc "đã mất member nhưng chưa bị chặn join".
   * `reason` chỉ ghi vào ServerBan/audit, không phát realtime cho cả server.
   */
  async ban(serverId: string, actorId: string, input: CreateBanInput): Promise<ServerBanDto> {
    // Target phải là member của server này (userId của server khác gắn vào URL: 404,
    // không lộ thông tin — pattern của kick).
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
        // Hai request ban đồng thời cùng lọt qua check member: unique (serverId, userId) chặn.
        if (isUniqueConstraintError(error)) {
          throw new ConflictException('This user is already banned from this server');
        }
        throw error;
      }

      // Tùy chọn xóa tin 24 giờ gần nhất: soft-delete như moderation xóa tin (deletedAt,
      // bỏ ghim) — row phải còn để "tin đã xóa" render được. Mỗi tin bị xóa ghi một event
      // outbox `message.deleted` cùng transaction: indexer (T5.3) gọn số dư tìm kiếm, đúng
      // pattern của MessagesService.remove (không phát N event socket tức thời — client
      // tải lại trang tin khi cần; ban là hành động hiếm, ưu tiên transaction gọn).
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

      // Ghi số tin đã xóa vào audit để có bằng chứng lượng dữ liệu bị tác động (quy tắc 11).
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

    // Giống kick: cache quyền và socket room của người bị ban phải mất ngay; refreshAccess
    // phát `member.removed` (kèm `banned: true`) riêng cho họ sau khi đá khỏi room.
    await this.abilityFactory.invalidateMember(serverId, input.userId);
    await this.realtime.refreshAccess(serverId, [input.userId], { banned: true });
    // Người khác trong server gỡ nạn nhân khỏi danh sách thành viên (event riêng — xem
    // lý do không dùng `member.removed` cho room server ở MemberBannedPayload).
    this.realtime.emitToServer(serverId, ServerEvents.MemberBanned, {
      serverId,
      userId: input.userId,
    });

    return this.toDto(ban.id);
  }

  /**
   * Unban: xóa hàng ServerBan + audit. Không có ban → 404, KHÔNG 204-im idempotent:
   * repo coi DELETE trên tài nguyên đã biến mất là 404 (kick member lạ, xóa tin đã
   * soft-delete đều 404) — 204 rỗng sẽ che luôn lỗi gõ nhầm userId/server.
   */
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

  /** Danh sách ban của server, mới nhất trước, phân trang cursor theo id (ADR-0028). */
  async list(serverId: string, { after, limit }: ListBansQuery): Promise<ServerBanPage> {
    const rows = await this.prisma.serverBan.findMany({
      where: { serverId, ...(after ? { id: { lt: after } } : {}) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        bannedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { id: 'desc' },
      take: limit + 1, // lấy dư một hàng để biết còn trang sau
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

  /** Đọc lại đầy đủ quan hệ sau khi transaction cam kết (DTO không dựng từ client tx). */
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

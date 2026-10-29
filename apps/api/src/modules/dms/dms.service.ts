import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ErrorCodes,
  type BlockedUsersResponse,
  type DmListResponse,
  type DmSummary,
} from '@ping/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Trần spam (ADR-0070 mục 5): tối đa 10 DM MỚI/giờ/user — đếm DB trên DmParticipant.createdAt
 * (index `@@index([userId])`) nên không mất trạng thái khi Redis restart. Local cho module như
 * LIMIT của MessageRateLimiter: bản chất giới hạn tần suất, không phải trần thực thể của Limits. */
const DMS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;
/** Trần đếm unread (ADR-0070 mục 7): cùng ngữ nghĩa COUNT_CAP của ReadStateService. */
const COUNT_CAP = 100;
/** Mốc so sánh UUIDv7: tin không có cursor = toàn bộ là chưa đọc (pattern unreadForServer). */
const zero = '00000000-0000-0000-0000-000000000000';

/** Vi phạm điều kiện cho phép DM — CÙNG mã `DM_BLOCKED` cho "bị chặn" lẫn "tắt DM" để không
 * dò được nguyên nhân (ADR-0070 mục 3, quy tắc 14: client rẽ nhánh theo code). */
function dmBlocked(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCodes.DM_BLOCKED,
    message: 'DM is not allowed',
  });
}

/**
 * Chuẩn hóa cặp participant thành `dmKey` = `"min|max"` hai UUID đã xếp thứ tự (ADR-0070
 * mục 1-2): UUIDv7 so sánh theo byte = theo thời gian nên thứ tự ổn định bất kể ai là người
 * tạo trước — chìa khóa idempotent của POST /dms và của unique `Channel.dmKey`.
 */
export function dmKeyFor(meId: string, targetId: string): string {
  return meId < targetId ? `${meId}|${targetId}` : `${targetId}|${meId}`;
}

/**
 * DM 1:1 + chặn người dùng (TG.9, ADR-0070). DM không có Member → membership và con trỏ đọc
 * nằm trên `DmParticipant`; điều kiện cho phép kiểm tại thời điểm TẠO cặp (get-or-create),
 * còn tin MỚI trong DM có sẵn bị chặn ở MessagesService khi có UserBlock.
 */
@Injectable()
export class DmsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /dms — get-or-create idempotent (ADR-0070 mục 2): cặp đã có → 200 với channel cũ
   * (kể cả khi hiện bị chặn: đọc tin cũ là chủ đích); chưa có → một transaction kiểm điều
   * kiện (mục 3) rồi tạo Channel + 2 DmParticipant. Hai request song song cùng cặp: hàng sau
   * chạm unique `dmKey` → bắt P2002 và trả existing — LUÔN 200, không 409.
   */
  async create(meId: string, targetId: string): Promise<DmSummary> {
    if (meId === targetId) {
      throw new BadRequestException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Cannot DM yourself',
      });
    }
    // Chuẩn hóa thứ tự cặp: UUIDv7 so sánh theo byte = theo thời gian (pattern con trỏ read-state).
    const dmKey = dmKeyFor(meId, targetId);

    const existing = await this.summaries(meId, dmKey);
    if (existing.length > 0) {
      return existing[0];
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetId },
          select: { id: true, username: true, displayName: true, avatarUrl: true, dmAllow: true },
        });
        if (!target) {
          throw new NotFoundException('User not found');
        }
        // (b) chung server — MỘT truy vấn EXISTS giao Member (index Member.userId sẵn có, không N+1).
        const shared = await tx.$queryRaw<{ ok: boolean }[]>(
          Prisma.sql`SELECT EXISTS (
            SELECT 1 FROM "Member" m1
            JOIN "Member" m2 ON m1."serverId" = m2."serverId"
            WHERE m1."userId" = ${meId} AND m2."userId" = ${targetId}
          ) AS ok`,
        );
        if (!shared[0]?.ok) {
          throw dmBlocked();
        }
        // (c) target cho phép DM từ thành viên server chung; (d) chưa có UserBlock theo bất kỳ
        // chiều nào. Vi phạm (c) lẫn (d) cùng trả DM_BLOCKED (chống dò nguyên nhân).
        if (target.dmAllow !== 'server_members') {
          throw dmBlocked();
        }
        const blocked = await tx.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: meId, blockedId: targetId },
              { blockerId: targetId, blockedId: meId },
            ],
          },
          select: { blockerId: true },
        });
        if (blocked) {
          throw dmBlocked();
        }
        // (e) trần 10 DM mới/giờ: 10 hàng DmParticipant mới nhất của tôi còn trong cửa sổ 1 giờ
        // thì chặn, Retry-After tính đến khi hàng cũ nhất ra khỏi cửa sổ.
        const recent = await tx.dmParticipant.findMany({
          where: { userId: meId },
          orderBy: { createdAt: 'desc' },
          take: DMS_PER_HOUR,
          select: { createdAt: true },
        });
        const oldest = recent[DMS_PER_HOUR - 1]?.createdAt;
        if (oldest && oldest.getTime() > Date.now() - HOUR_MS) {
          throw new TooManyRequestsError(
            Math.ceil((oldest.getTime() + HOUR_MS - Date.now()) / 1000),
            'Too many new DMs in the past hour',
          );
        }
        // Channel DM: không thuộc server nào (serverId NULL — migration expand), name rỗng
        // (sidebar hiển thị hồ sơ đối tác), dmKey chốt idempotency.
        const channel = await tx.channel.create({
          data: { type: 'DM', name: '', dmKey },
          select: { id: true },
        });
        await tx.dmParticipant.createMany({
          data: [
            { channelId: channel.id, userId: meId },
            { channelId: channel.id, userId: targetId },
          ],
        });
        return {
          channelId: channel.id,
          partner: {
            id: target.id,
            username: target.username,
            displayName: target.displayName,
            avatarUrl: target.avatarUrl,
          },
          unreadCount: 0,
          lastReadMessageId: null,
          lastMessageAt: null,
        };
      });
    } catch (error) {
      // Hai request song song cùng cặp: unique `dmKey` chặn ghi trùng → trả channel đã tồn tại.
      if (isUniqueConstraintError(error)) {
        const summary = await this.summaries(meId, dmKey);
        if (summary.length > 0) {
          return summary[0];
        }
      }
      throw error;
    }
  }

  /**
   * GET /dms — danh sách DM của người gọi (ADR-0070 mục 7): đối tác + unreadCount theo công
   * thức `unreadForServer` (không tính tin của chính mình, tin đã xóa mềm, trần 100) nhưng
   * qua `DmParticipant.lastReadMessageId`. Thứ tự theo tin mới nhất, DM chưa có tin xếp sau.
   * Một truy vấn duy nhất cho cả danh sách (không N+1).
   */
  async list(meId: string): Promise<DmListResponse> {
    return { dms: await this.summaries(meId) };
  }

  /**
   * POST /users/:userId/block — idempotent; chặn hai mức (tạo DM mới + tin mới trong DM có
   * sẵn, mức sau kiểm ở MessagesService). KHÔNG ghi AuditLog: AuditLog.serverId là bắt buộc
   * (schema.prisma) mà chặn user không có bối cảnh server nào — ADR-0070 chấp nhận DM/block
   * không có audit (mục Context).
   */
  async block(meId: string, targetId: string): Promise<void> {
    if (meId === targetId) {
      throw new BadRequestException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Cannot block yourself',
      });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    // Upsert: chặn lại người đã chặn không đổi gì.
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: meId, blockedId: targetId } },
      create: { blockerId: meId, blockedId: targetId },
      update: {},
    });
  }

  /** DELETE /users/:userId/block — idempotent: gỡ người chưa chặn vẫn 204. */
  async unblock(meId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: meId, blockedId: targetId },
    });
  }

  /**
   * GET /users/me/blocks (TG.13): liệt kê người TÔI đã chặn (UserBlock của TG.9), mới nhất
   * trước. Gộp vào service này để mọi truy vấn UserBlock ở một chỗ; bỏ chặn tái dùng
   * DELETE /users/:userId/block — không thêm endpoint. Dữ liệu user-scoped: khóa
   * `blockerId` theo JWT; hồ sơ bị chặn trả đúng shape BlockedUserDto, không lộ gì thêm.
   */
  async listBlocks(meId: string): Promise<BlockedUsersResponse> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: meId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    return {
      blocked: rows.map((row) => ({
        userId: row.blocked.id,
        username: row.blocked.username,
        displayName: row.blocked.displayName,
        avatarUrl: row.blocked.avatarUrl,
        blockedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Danh sách DmSummary của `meId` (lọc thêm `dmKey` cho đường get-or-create): join đối tác
   * qua hàng DmParticipant còn lại của cùng channel, đếm unread có trần 100, lấy mốc tin mới
   * nhất. `lastMessageAt` NULL xếp sau (ORDER BY ... DESC NULLS LAST).
   */
  private async summaries(meId: string, dmKey?: string): Promise<DmSummary[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        channelId: string;
        lastReadMessageId: string | null;
        partnerId: string;
        partnerUsername: string;
        partnerDisplayName: string;
        partnerAvatarUrl: string | null;
        unreadCount: number;
        lastMessageAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        c.id::text AS "channelId",
        p."lastReadMessageId"::text AS "lastReadMessageId",
        u.id::text AS "partnerId",
        u.username AS "partnerUsername",
        u."displayName" AS "partnerDisplayName",
        u."avatarUrl" AS "partnerAvatarUrl",
        LEAST((
          SELECT count(*) FROM "Message" m
          WHERE m."channelId" = c.id
            AND m."deletedAt" IS NULL
            AND m."authorId" <> ${meId}
            AND m.id > COALESCE(p."lastReadMessageId", ${zero}::uuid)
        ), ${COUNT_CAP})::int AS "unreadCount",
        (
          SELECT max(m."createdAt") FROM "Message" m
          WHERE m."channelId" = c.id AND m."deletedAt" IS NULL
        ) AS "lastMessageAt"
      FROM "DmParticipant" p
      JOIN "Channel" c ON c.id = p."channelId" AND c."type" = 'DM'
      JOIN "DmParticipant" other ON other."channelId" = c.id AND other."userId" <> p."userId"
      JOIN "User" u ON u.id = other."userId"
      WHERE p."userId" = ${meId}
        ${dmKey ? Prisma.sql`AND c."dmKey" = ${dmKey}` : Prisma.empty}
      ORDER BY "lastMessageAt" DESC NULLS LAST
    `);
    return rows.map((row) => ({
      channelId: row.channelId,
      partner: {
        id: row.partnerId,
        username: row.partnerUsername,
        displayName: row.partnerDisplayName,
        avatarUrl: row.partnerAvatarUrl,
      },
      unreadCount: row.unreadCount,
      lastReadMessageId: row.lastReadMessageId,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    }));
  }
}

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

const DMS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;
const COUNT_CAP = 100;
// Mốc so sánh UUIDv7: không có cursor = toàn bộ chưa đọc.
const zero = '00000000-0000-0000-0000-000000000000';

// Cùng mã DM_BLOCKED cho 'bị chặn' lẫn 'tắt DM' để không dò được nguyên nhân.
function dmBlocked(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCodes.DM_BLOCKED,
    message: 'DM is not allowed',
  });
}

// dmKey = 'min|max' hai UUID đã sắp: thứ tự ổn định, là khóa idempotent của POST /dms.
export function dmKeyFor(meId: string, targetId: string): string {
  return meId < targetId ? `${meId}|${targetId}` : `${targetId}|${meId}`;
}

@Injectable()
export class DmsService {
  constructor(private readonly prisma: PrismaService) {}

  // Cặp đã có trả channel cũ kể cả khi hiện bị chặn (đọc tin cũ là chủ đích).
  async create(meId: string, targetId: string): Promise<DmSummary> {
    if (meId === targetId) {
      throw new BadRequestException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Cannot DM yourself',
      });
    }
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
        // serverId NULL; name rỗng (sidebar hiển thị hồ sơ đối tác).
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
      // Race cùng cặp: unique dmKey chặn ghi trùng → trả channel đã tồn tại.
      if (isUniqueConstraintError(error)) {
        const summary = await this.summaries(meId, dmKey);
        if (summary.length > 0) {
          return summary[0];
        }
      }
      throw error;
    }
  }

  async list(meId: string): Promise<DmListResponse> {
    return { dms: await this.summaries(meId) };
  }

  // KHÔNG ghi AuditLog: AuditLog.serverId bắt buộc mà block không có bối cảnh server.
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
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: meId, blockedId: targetId } },
      create: { blockerId: meId, blockedId: targetId },
      update: {},
    });
  }

  async unblock(meId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: meId, blockedId: targetId },
    });
  }

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
        (SELECT count(*) FROM (
          SELECT 1 FROM "Message" m
          WHERE m."channelId" = c.id
            AND m."deletedAt" IS NULL
            AND m."authorId" <> ${meId}
            AND m.id > COALESCE(p."lastReadMessageId", ${zero}::uuid)
          LIMIT ${COUNT_CAP}
        ) capped)::int AS "unreadCount",
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

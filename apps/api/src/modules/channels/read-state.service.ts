import { Injectable, NotFoundException } from '@nestjs/common';
import { ServerEvents, type ChannelUnreadDto } from '@ping/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/** Trần đếm (ADR-0043): quá 100 hiển thị "99+" phía UI; SQL trả tối đa giá trị 100. */
const COUNT_CAP = 100;

/**
 * Trạng thái đã đọc theo thành viên-kênh (T4.2, ADR-0043).
 *
 * Cursor `lastReadMessageId` chỉ tiến không lùi: hai tab ghi đồng thời không làm badge
 * "chạy lùi". Chưa có hàng read state = toàn bộ channel là chưa đọc.
 */
@Injectable()
export class ReadStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** PUT /channels/:channelId/read — guard đã xác nhận người gọi xem được channel. */
  async markRead(channelId: string, userId: string, messageId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    // Cursor phải là tin của đúng channel này — không cho đặt mốc tùy ý.
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!message || message.channelId !== channelId) {
      throw new NotFoundException('Message not found');
    }
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Hai lệnh idempotent, an toàn khi 2 tab ghi song song: insert-if-absent, sau đó chỉ
    // update khi cursor hiện tại cũ hơn (UUIDv7 so sánh theo byte = theo thời gian).
    const inserted = await this.prisma.channelReadState.createMany({
      data: [{ memberId: member.id, channelId, lastReadMessageId: messageId }],
      skipDuplicates: true,
    });
    const advanced = await this.prisma.channelReadState.updateMany({
      where: {
        memberId: member.id,
        channelId,
        OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: messageId } }],
      },
      data: { lastReadMessageId: messageId },
    });
    if (inserted.count > 0 || advanced.count > 0) {
      this.realtime.emitToUser(userId, ServerEvents.ReadUpdated, {
        channelId,
        lastReadMessageId: messageId,
      });
    }
  }

  /**
   * GET /servers/:serverId/unread — một truy vấn duy nhất cho mọi channel của server:
   * unread = tin chưa xóa mềm sau cursor (không tính tin của chính người gọi — họ đã
   * thấy mình gửi), mentionCount = hàng MessageMention sau cursor khớp mình trực tiếp /
   * role của mình / everyone. Cả hai có trần 100 (LEAST), đúng ghi chú T4.1 về
   * `message.deletedAt IS NULL`.
   */
  async unreadForServer(serverId: string, userId: string): Promise<ChannelUnreadDto[]> {
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const zero = '00000000-0000-0000-0000-000000000000';
    return this.prisma.$queryRaw<ChannelUnreadDto[]>(Prisma.sql`
      SELECT
        c.id::text AS "channelId",
        rs."lastReadMessageId"::text AS "lastReadMessageId",
        LEAST((
          SELECT count(*) FROM "Message" m
          WHERE m."channelId" = c.id
            AND m."deletedAt" IS NULL
            AND m."authorId" <> ${userId}
            AND m.id > COALESCE(rs."lastReadMessageId", ${zero}::uuid)
        ), ${COUNT_CAP})::int AS "unreadCount",
        LEAST((
          SELECT count(*) FROM "MessageMention" mm
          JOIN "Message" m2 ON m2.id = mm."messageId" AND m2."deletedAt" IS NULL
          WHERE m2."channelId" = c.id
            AND m2.id > COALESCE(rs."lastReadMessageId", ${zero}::uuid)
            AND (
              mm."mentionedMemberId" = ${member.id}
              OR mm.kind = 'everyone'
              OR mm."roleId" IN (
                SELECT "roleId" FROM "MemberRole" WHERE "memberId" = ${member.id}
              )
            )
        ), ${COUNT_CAP})::int AS "mentionCount"
      FROM "Channel" c
      LEFT JOIN "ChannelReadState" rs
        ON rs."channelId" = c.id AND rs."memberId" = ${member.id}
      WHERE c."serverId" = ${serverId}
      ORDER BY c."position" ASC
    `);
  }
}

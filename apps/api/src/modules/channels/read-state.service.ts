import { Injectable, NotFoundException } from '@nestjs/common';
import { ServerEvents, type ChannelUnreadDto, type ServerUnreadDto } from '@ping/shared';
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
      select: { id: true, serverId: true, type: true },
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
    // TG.9 (ADR-0070 mục 7): DM không có Member — cursor đọc ghi thẳng lên DmParticipant,
    // cùng ngữ nghĩa "chỉ tiến" với ChannelReadState. markRead gọi sau khi AbilityGuard
    // xác nhận participant nên hàng chắc chắn tồn tại; updateMany là phòng hờ + lọc cursor.
    if (channel.type === 'DM') {
      const advanced = await this.prisma.dmParticipant.updateMany({
        where: {
          channelId,
          userId,
          OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: messageId } }],
        },
        data: { lastReadMessageId: messageId },
      });
      if (advanced.count > 0) {
        this.realtime.emitToUser(userId, ServerEvents.ReadUpdated, {
          channelId,
          lastReadMessageId: messageId,
        });
      }
      return;
    }
    // Channel server luôn có serverId (chỉ DM mới NULL — ADR-0070); nhánh DM đã return.
    if (channel.serverId === null) {
      throw new NotFoundException('Channel not found');
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
   * Hai biểu thức đếm dùng chung cho cả hai endpoint unread (đếm theo channel `c`, cursor
   * `rs`): unread = tin chưa xóa mềm sau cursor (không tính tin của chính người gọi — họ đã
   * thấy mình gửi), mentionCount = hàng MessageMention sau cursor khớp mình trực tiếp / role
   * của mình / everyone. Cả hai có trần 100 (LEAST), đúng ghi chú T4.1 về
   * `message.deletedAt IS NULL`.
   *
   * `memberIdRef` là tham chiếu tới thành viên đang xét: literal `member.id` ở truy vấn một
   * server, `m.id` (alias Member) ở truy vấn gộp — nhờ vậy một tin được đếm đúng mention của
   * từng thành viên trong cùng một câu SQL.
   */
  private unreadCounts(userId: string, memberIdRef: Prisma.Sql): Prisma.Sql {
    const zero = '00000000-0000-0000-0000-000000000000';
    return Prisma.sql`
      LEAST((
        SELECT count(*) FROM "Message" msg
        WHERE msg."channelId" = c.id
          AND msg."deletedAt" IS NULL
          AND msg."authorId" <> ${userId}
          AND msg.id > COALESCE(rs."lastReadMessageId", ${zero}::uuid)
      ), ${COUNT_CAP})::int AS "unreadCount",
      LEAST((
        SELECT count(*) FROM "MessageMention" mm
        JOIN "Message" msg2 ON msg2.id = mm."messageId" AND msg2."deletedAt" IS NULL
        WHERE msg2."channelId" = c.id
          AND msg2.id > COALESCE(rs."lastReadMessageId", ${zero}::uuid)
          AND (
            mm."mentionedMemberId" = ${memberIdRef}
            OR mm.kind = 'everyone'
            OR mm."roleId" IN (
              SELECT "roleId" FROM "MemberRole" WHERE "memberId" = ${memberIdRef}
            )
          )
      ), ${COUNT_CAP})::int AS "mentionCount"
    `;
  }

  /** GET /servers/:serverId/unread — một dòng mỗi channel của server. */
  async unreadForServer(serverId: string, userId: string): Promise<ChannelUnreadDto[]> {
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.$queryRaw<ChannelUnreadDto[]>(Prisma.sql`
      SELECT
        c.id::text AS "channelId",
        rs."lastReadMessageId"::text AS "lastReadMessageId",
        ${this.unreadCounts(userId, Prisma.sql`${member.id}`)}
      FROM "Channel" c
      LEFT JOIN "ChannelReadState" rs
        ON rs."channelId" = c.id AND rs."memberId" = ${member.id}
      WHERE c."serverId" = ${serverId}
      ORDER BY c."position" ASC
    `);
  }

  /**
   * GET /users/me/unread (ADR-0077) — unread của MỌI server người gọi là thành viên trong
   * một truy vấn, nhóm theo server. Rail trước đây gọi `/servers/:id/unread` cho từng server
   * (69 request, 38 bị 429 trên tài khoản 69 server — docs/discord-practices.md mục 1).
   * Server không có channel vẫn trả về với `channels: []` (LEFT JOIN) để client biết mình
   * còn thuộc server đó.
   */
  async unreadForUser(userId: string): Promise<ServerUnreadDto[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        serverId: string;
        channelId: string | null;
        lastReadMessageId: string | null;
        unreadCount: number;
        mentionCount: number;
      }>
    >(Prisma.sql`
      SELECT
        m."serverId"::text AS "serverId",
        c.id::text AS "channelId",
        rs."lastReadMessageId"::text AS "lastReadMessageId",
        ${this.unreadCounts(userId, Prisma.sql`m.id`)}
      FROM "Member" m
      LEFT JOIN "Channel" c ON c."serverId" = m."serverId"
      LEFT JOIN "ChannelReadState" rs
        ON rs."channelId" = c.id AND rs."memberId" = m.id
      WHERE m."userId" = ${userId}
      ORDER BY m."joinedAt" ASC, m."serverId" ASC, c."position" ASC
    `);

    const grouped = new Map<string, ServerUnreadDto>();
    for (const row of rows) {
      let entry = grouped.get(row.serverId);
      if (!entry) {
        entry = { serverId: row.serverId, channels: [] };
        grouped.set(row.serverId, entry);
      }
      if (row.channelId !== null) {
        entry.channels.push({
          channelId: row.channelId,
          unreadCount: row.unreadCount,
          mentionCount: row.mentionCount,
          lastReadMessageId: row.lastReadMessageId,
        });
      }
    }
    return [...grouped.values()];
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ServerEvents, type ChannelUnreadDto, type ServerUnreadDto } from '@ping/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const COUNT_CAP = 100;

// Cursor chỉ tiến; chưa có hàng read state = toàn bộ channel chưa đọc.
@Injectable()
export class ReadStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async markRead(channelId: string, userId: string, messageId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    // Cursor phải là tin của đúng channel này.
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!message || message.channelId !== channelId) {
      throw new NotFoundException('Message not found');
    }
    // DM không có Member: cursor ghi lên DmParticipant; updateMany lọc cursor chỉ tiến.
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

    // Hai lệnh idempotent: insert-if-absent rồi chỉ update khi cursor cũ hơn (an toàn khi 2 tab ghi song song).
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

  // Trần 100 đặt trong truy vấn con (LIMIT) để Postgres dừng quét sớm thay vì count(*) toàn bộ.
  // memberIdRef: literal member.id ở truy vấn một server, m.id (alias Member) ở truy vấn gộp.
  private unreadCounts(userId: string, memberIdRef: Prisma.Sql): Prisma.Sql {
    const zero = '00000000-0000-0000-0000-000000000000';
    return Prisma.sql`
      (SELECT count(*) FROM (
        SELECT 1 FROM "Message" msg
        WHERE msg."channelId" = c.id
          AND msg."deletedAt" IS NULL
          AND msg."authorId" <> ${userId}
          AND msg.id > COALESCE(rs."lastReadMessageId", ${zero}::uuid)
        LIMIT ${COUNT_CAP}
      ) capped)::int AS "unreadCount",
      (SELECT count(*) FROM (
        SELECT 1 FROM "MessageMention" mm
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
        LIMIT ${COUNT_CAP}
      ) capped)::int AS "mentionCount"
    `;
  }

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

  // Server không có channel vẫn trả về với channels: [] (LEFT JOIN).
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

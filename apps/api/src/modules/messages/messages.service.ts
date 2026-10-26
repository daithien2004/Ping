import { ForbiddenError, subject } from '@casl/ability';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCodes,
  Limits,
  ServerEvents,
  reactionEmojiSchema,
  type AppAbility,
  type CreateMessageInput,
  type MessageReactionDto,
  type MessageReactionSummary,
  type ReactionUsersPage,
  type ReactionUsersQuery,
} from '@ping/shared';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OutboxService } from '../../infra/events/outbox.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { MessageRateLimiter } from './message-rate-limiter.js';
import { ReactionRateLimiter } from './reaction-rate-limiter.js';
import { extractMentionTokens } from './mention-parser.js';
import { resolveMentions } from './mention-resolver.js';
import type { ListMessagesQuery } from './schemas.js';

/** Chỉ các trường client cần — không bao giờ trả bản ghi thô (guide 10.3). */
const messageWithAuthor = {
  id: true,
  content: true,
  nonce: true,
  editedAt: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  // TG.1: xem trước tin gốc cho khối trích dẫn (kể cả tin đã soft-delete — cờ `deleted`).
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      author: { select: { displayName: true } },
    },
  },
} as const;

/** Đoạn trích 120 ký tự cho preview reply (TG.1). */
function replyPreview(
  replyTo: {
    id: string;
    content: string;
    deletedAt: Date | null;
    author: { displayName: string };
  } | null,
): { id: string; authorName: string; content: string; deleted: boolean } | null {
  if (!replyTo) return null;
  return {
    id: replyTo.id,
    authorName: replyTo.author.displayName,
    content: replyTo.deletedAt ? '' : replyTo.content.slice(0, 120),
    deleted: replyTo.deletedAt !== null,
  };
}

/** Hàng Prisma (select `messageWithAuthor`) → DTO: `replyTo` preview + cảm xúc đã tổng hợp. */
function toMessageDto<T extends { replyTo: Parameters<typeof replyPreview>[0] }>(
  row: T,
  reactions: MessageReactionDto[] = [],
) {
  const { replyTo, ...rest } = row;
  return { ...rest, replyTo: replyPreview(replyTo), reactions };
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly rateLimiter: MessageRateLimiter,
    private readonly reactionLimiter: ReactionRateLimiter,
    private readonly outbox: OutboxService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  /**
   * Phân trang cursor/keyset (guide 10.3): WHERE id < before ORDER BY id DESC.
   * Nhảy thẳng tới đúng vị trí trong index (channelId, id desc) — không đọc rồi
   * vứt hàng chục nghìn row như OFFSET. Lấy dư 1 để biết còn trang cũ hơn không.
   *
   * `after` (T4.4, ADR-0044): chiều ngược — tin MỚI HƠN cursor, thứ tự tăng dần,
   * `hasMore` = còn tin mới hơn nữa; dùng để vá khoảng trống khi reconnect.
   *
   * `around` (TG.5, ADR-0063): cửa sổ quanh một tin cho permalink — hai truy vấn keyset
   * (nửa cũ hơn gồm chính tin đích, nửa mới hơn), gộp lại theo thứ tự mới nhất trước như
   * trang thường. Tin đích phải nằm trong CHÍNH channel và chưa bị xóa mềm, nếu không 404
   * (không phân biệt "không tồn tại" với "thuộc channel khác" để không lộ id).
   */
  async list(channelId: string, query: ListMessagesQuery, viewerId: string) {
    if (query.around !== undefined) {
      return this.listAround(channelId, query.around, query.limit, viewerId);
    }
    if (query.after !== undefined) {
      const messages = await this.prisma.message.findMany({
        where: {
          channelId,
          deletedAt: null,
          id: { gt: query.after },
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
        select: messageWithAuthor,
      });
      const hasMore = messages.length > query.limit;
      const page = hasMore ? messages.slice(0, query.limit) : messages;
      const reactions = await this.reactionMap(
        page.map((message) => message.id),
        viewerId,
      );
      return {
        messages: page.map((message) => toMessageDto(message, reactions.get(message.id) ?? [])),
        hasMore,
      };
    }

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        // Tin soft-delete biến mất khỏi lịch sử nhưng vẫn nằm trong DB.
        deletedAt: null,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: messageWithAuthor,
    });

    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;
    const reactions = await this.reactionMap(
      page.map((message) => message.id),
      viewerId,
    );
    return {
      messages: page.map((message) => toMessageDto(message, reactions.get(message.id) ?? [])),
      hasMore,
    };
  }

  /**
   * Cửa sổ quanh `aroundId` (TG.5): `limit` chia đôi — nửa cũ hơn GỒM tin đích, nửa mới hơn.
   * Hai truy vấn keyset độc lập dùng index `(channelId, id)` nên chi phí không phụ thuộc số
   * tin của channel; lấy dư 1 mỗi phía để biết còn tin cũ/mới hơn ngoài cửa sổ.
   */
  private async listAround(channelId: string, aroundId: string, limit: number, viewerId: string) {
    const target = await this.prisma.message.findUnique({
      where: { id: aroundId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    // 404 cho cả ba trường hợp: không tồn tại, khác channel, đã xóa mềm.
    if (!target || target.channelId !== channelId || target.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }
    const olderLimit = Math.ceil(limit / 2);
    const newerLimit = limit - olderLimit;
    const [olderRows, newerRows] = await Promise.all([
      this.prisma.message.findMany({
        where: { channelId, deletedAt: null, id: { lte: aroundId } },
        orderBy: { id: 'desc' },
        take: olderLimit + 1,
        select: messageWithAuthor,
      }),
      this.prisma.message.findMany({
        where: { channelId, deletedAt: null, id: { gt: aroundId } },
        orderBy: { id: 'asc' },
        // +1 để biết còn tin mới hơn nữa; newerLimit = 0 (limit 1) vẫn lấy 1 tin để kiểm.
        take: newerLimit + 1,
        select: messageWithAuthor,
      }),
    ]);
    const hasMore = olderRows.length > olderLimit;
    const hasNewer = newerRows.length > newerLimit;
    const older = olderRows.slice(0, olderLimit);
    // Trang trả về mới nhất trước (như mọi trang khác), nên nửa mới hơn phải đảo lại.
    const newer = newerRows.slice(0, newerLimit).reverse();
    const page = [...newer, ...older];
    const reactions = await this.reactionMap(
      page.map((message) => message.id),
      viewerId,
    );
    return {
      messages: page.map((message) => toMessageDto(message, reactions.get(message.id) ?? [])),
      hasMore,
      hasNewer,
    };
  }

  async create(channelId: string, authorId: string, input: CreateMessageInput) {
    await this.rateLimiter.consume(authorId, channelId);
    // Bối cảnh server để kiểm MENTION_EVERYONE khi parse mention (ADR-0043); guard đã
    // xác nhận người gửi là thành viên nên channel luôn tồn tại ở bước này.
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    const actor = await this.abilityFactory.contextFor(channel.serverId, authorId);
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        // TG.1: tin gốc phải nằm trong CÙNG channel (chốt IDOR); soft-delete vẫn cho reply.
        let replyToId: string | undefined;
        if (input.replyToId !== undefined) {
          const original = await tx.message.findUnique({
            where: { id: input.replyToId },
            select: { id: true, channelId: true },
          });
          if (!original || original.channelId !== channelId) {
            throw new BadRequestException('Reply target must be in the same channel');
          }
          replyToId = original.id;
        }
        const created = await tx.message.create({
          // Prisma 7: field có giá trị `undefined` trong data là lỗi — spread có điều kiện.
          data: {
            channelId,
            authorId,
            content: input.content,
            nonce: input.nonce,
            ...(replyToId !== undefined ? { replyToId } : {}),
          },
          select: messageWithAuthor,
        });
        const mentions = await resolveMentions(
          tx,
          channel.serverId,
          actor,
          extractMentionTokens(input.content),
        );
        if (mentions.length > 0) {
          await tx.messageMention.createMany({
            data: mentions.map((mention) => ({ messageId: created.id, ...mention })),
          });
        }
        await this.outbox.write(tx, {
          aggregateType: 'Message',
          aggregateId: created.id,
          type: ServerEvents.MessageCreated,
          payload: {
            id: created.id,
            channelId,
            authorId,
            author: created.author,
            content: created.content,
            createdAt: created.createdAt.toISOString(),
            nonce: created.nonce,
            replyTo: replyPreview(created.replyTo),
          },
        });
        return created;
      });
      this.realtime.emitToChannel(channelId, ServerEvents.MessageCreated, {
        id: message.id,
        channelId,
        authorId,
        author: message.author,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        nonce: message.nonce,
        replyTo: replyPreview(message.replyTo),
      });
      // T4.3: metadata (không nội dung) tới room server để badge unread của kênh không
      // đang xem tăng realtime; người xem kênh nhận cả hai event nhưng bỏ qua event này.
      this.realtime.emitToServer(channel.serverId, ServerEvents.ChannelActivity, {
        channelId,
        serverId: channel.serverId,
        messageId: message.id,
        authorId,
      });
      // Ping riêng người được mention (T4.2): broadcast tới room channel giữ nguyên (ranh
      // giới quyền), event cá nhân chỉ tới từng người được nhắc. Không chặn response —
      // tin đã commit, ping lỗi không làm hỏng đường gửi.
      void this.notifyMentionedUsers(message.id, channelId, channel.serverId).catch(
        () => undefined,
      );
      return toMessageDto(message, []);
    } catch (error) {
      // Client retry (mạng chập chờn) gửi lại CÙNG nonce → unique
      // (channelId, authorId, nonce) chặn ghi trùng: trả đúng tin cũ thay vì lỗi.
      // Không phát event lần hai vì client khác đã nhận tin này từ lần tạo đầu.
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.message.findUniqueOrThrow({
          where: { channelId_authorId_nonce: { channelId, authorId, nonce: input.nonce } },
          select: messageWithAuthor,
        });
        const reactions = await this.reactionMap([existing.id], authorId);
        return toMessageDto(existing, reactions.get(existing.id) ?? []);
      }
      throw error;
    }
  }

  async update(messageId: string, ability: AppAbility, content: string, viewerId: string) {
    const message = await this.getMessage(messageId);
    // Tier 2 (guide 10.2): rule "update Message WHERE authorId = me" chỉ kiểm
    // tra được khi đã có đối tượng thật trong tay.
    ForbiddenError.from(ability).throwUnlessCan('update', subject('Message', message));

    // Sửa tin = parse lại mention: xoá toàn bộ hàng cũ rồi ghi lại từ nội dung mới
    // (ADR-0043), trong cùng transaction với cập nhật tin.
    const channel = await this.prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { serverId: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    const actor = await this.abilityFactory.contextFor(channel.serverId, message.authorId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.update({
        where: { id: message.id },
        data: { content, editedAt: new Date() },
        select: messageWithAuthor,
      });
      await tx.messageMention.deleteMany({ where: { messageId: message.id } });
      const mentions = await resolveMentions(
        tx,
        channel.serverId,
        actor,
        extractMentionTokens(content),
      );
      if (mentions.length > 0) {
        await tx.messageMention.createMany({
          data: mentions.map((mention) => ({ messageId: message.id, ...mention })),
        });
      }
      await this.outbox.write(tx, {
        aggregateType: 'Message',
        aggregateId: row.id,
        type: ServerEvents.MessageUpdated,
        payload: {
          id: row.id,
          channelId: message.channelId,
          content: row.content,
          updatedAt: (row.editedAt ?? row.createdAt).toISOString(),
        },
      });
      return row;
    });

    this.realtime.emitToChannel(message.channelId, ServerEvents.MessageUpdated, {
      id: updated.id,
      channelId: message.channelId,
      content: updated.content,
      updatedAt: (updated.editedAt ?? updated.createdAt).toISOString(),
    });

    const reactions = await this.reactionMap([updated.id], viewerId);
    return toMessageDto(updated, reactions.get(updated.id) ?? []);
  }

  /**
   * Phát `mention.created` tới từng user được mention (T4.2): user trực tiếp, member của
   * role được nhắc, hoặc mọi member với @everyone. Chỉ người còn xem được channel nhận
   * (kiểm ability, có cache) — không ping kẻ không được đọc. Không phát lại khi sửa tin.
   */
  private async notifyMentionedUsers(
    messageId: string,
    channelId: string,
    serverId: string,
  ): Promise<void> {
    const mentions = await this.prisma.messageMention.findMany({
      where: { messageId },
      select: { kind: true, mentionedMemberId: true, roleId: true },
    });
    if (mentions.length === 0) {
      return;
    }
    const memberIds = new Set<string>();
    for (const mention of mentions) {
      if (mention.kind === 'user' && mention.mentionedMemberId) {
        memberIds.add(mention.mentionedMemberId);
      } else if (mention.kind === 'role' && mention.roleId) {
        const holders = await this.prisma.memberRole.findMany({
          where: { roleId: mention.roleId },
          select: { memberId: true },
        });
        for (const holder of holders) memberIds.add(holder.memberId);
      } else if (mention.kind === 'everyone') {
        const members = await this.prisma.member.findMany({
          where: { serverId },
          select: { id: true },
        });
        for (const member of members) memberIds.add(member.id);
      }
    }
    if (memberIds.size === 0) {
      return;
    }
    const mentioned = await this.prisma.member.findMany({
      where: { id: { in: [...memberIds] } },
      select: { userId: true },
    });
    for (const member of mentioned) {
      try {
        const ability = await this.abilityFactory.createForUser(serverId, member.userId);
        if (ability.can('view', 'Message')) {
          this.realtime.emitToUser(member.userId, ServerEvents.MentionCreated, {
            messageId,
            channelId,
            serverId,
          });
        }
      } catch {
        // Không còn là member giữa chừng — bỏ qua, không ping.
      }
    }
  }

  async remove(messageId: string, actorId: string, ability: AppAbility): Promise<{ id: string }> {
    const message = await this.getMessage(messageId);
    // Tác giả được xóa tin của mình; ai có MANAGE_MESSAGES xóa được tin người khác.
    ForbiddenError.from(ability).throwUnlessCan('delete', subject('Message', message));

    // Soft delete: moderation cần lịch sử, và client cần event message.deleted
    // — row phải còn để biết nó từng tồn tại. Outbox ghi cùng transaction để
    // indexer (T5.3) nhận được cả khi realtime lỗi.
    const deletedPayload = { id: message.id, channelId: message.channelId };
    if (message.authorId === actorId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          data: { deletedAt: new Date() },
        });
        await this.outbox.write(tx, {
          aggregateType: 'Message',
          aggregateId: message.id,
          type: ServerEvents.MessageDeleted,
          payload: deletedPayload,
        });
      });
    } else {
      // Xóa tin của người khác là hành động moderation: phải có AuditLog (quy tắc 11).
      const { serverId } = await this.prisma.channel.findUniqueOrThrow({
        where: { id: message.channelId },
        select: { serverId: true },
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          data: { deletedAt: new Date() },
        });
        await this.audit.record(
          {
            serverId,
            actorId,
            action: 'MESSAGE_DELETE',
            targetId: message.id,
            metadata: { authorId: message.authorId, channelId: message.channelId },
          },
          tx,
        );
        await this.outbox.write(tx, {
          aggregateType: 'Message',
          aggregateId: message.id,
          type: ServerEvents.MessageDeleted,
          payload: deletedPayload,
        });
      });
    }

    this.realtime.emitToChannel(message.channelId, ServerEvents.MessageDeleted, {
      id: message.id,
      channelId: message.channelId,
    });

    return { id: message.id };
  }

  /**
   * Thêm cảm xúc (TG.2, ADR-0064). Idempotent: thả lại cùng emoji trả về tổng hợp hiện tại,
   * không tạo hàng mới và không phát event lần hai. Chặn khi tin đã có 20 loại khác nhau.
   */
  async addReaction(
    messageId: string,
    userId: string,
    rawEmoji: string,
  ): Promise<MessageReactionSummary> {
    const emoji = this.parseReactionEmoji(rawEmoji);
    const message = await this.reactionTarget(messageId);
    await this.reactionLimiter.consume(userId, message.channelId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize all reaction writes for this message across API instances. The cap and
      // resulting count must be computed after the preceding writer has committed.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${messageId}))`;
      const existing = await tx.messageReaction.groupBy({ by: ['emoji'], where: { messageId } });
      const isNew = !existing.some((row) => row.emoji === emoji);
      if (isNew && existing.length >= Limits.REACTIONS_PER_MESSAGE) {
        throw new BadRequestException({
          code: ErrorCodes.REACTION_LIMIT_REACHED,
          message: `At most ${Limits.REACTIONS_PER_MESSAGE} distinct reactions per message`,
        });
      }
      const inserted = await tx.messageReaction.createMany({
        data: [{ messageId, userId, emoji }],
        skipDuplicates: true,
      });
      const count = await tx.messageReaction.count({ where: { messageId, emoji } });
      return { inserted: inserted.count, count };
    });

    if (result.inserted > 0) {
      this.realtime.emitToChannel(message.channelId, ServerEvents.ReactionAdded, {
        messageId,
        channelId: message.channelId,
        emoji,
        userId,
        count: result.count,
      });
    }
    return { messageId, reactions: await this.reactionSummary(messageId, userId) };
  }

  /** Gỡ cảm xúc (TG.2): idempotent, chỉ phát event khi thực sự xóa được hàng. */
  async removeReaction(
    messageId: string,
    userId: string,
    rawEmoji: string,
  ): Promise<MessageReactionSummary> {
    const emoji = this.parseReactionEmoji(rawEmoji);
    const message = await this.reactionTarget(messageId);
    await this.reactionLimiter.consume(userId, message.channelId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${messageId}))`;
      const deleted = await tx.messageReaction.deleteMany({ where: { messageId, userId, emoji } });
      const count = await tx.messageReaction.count({ where: { messageId, emoji } });
      return { deleted: deleted.count, count };
    });

    if (result.deleted > 0) {
      this.realtime.emitToChannel(message.channelId, ServerEvents.ReactionRemoved, {
        messageId,
        channelId: message.channelId,
        emoji,
        userId,
        count: result.count,
      });
    }
    return { messageId, reactions: await this.reactionSummary(messageId, userId) };
  }

  /** Danh sách người thả một emoji, keyset tăng dần theo id + tổng số (TG.2). */
  async reactionUsers(
    messageId: string,
    rawEmoji: string,
    query: ReactionUsersQuery,
  ): Promise<ReactionUsersPage> {
    const emoji = this.parseReactionEmoji(rawEmoji);
    const message = await this.reactionTarget(messageId);
    const [rows, total] = await Promise.all([
      this.prisma.messageReaction.findMany({
        where: {
          messageId: message.id,
          emoji,
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
        select: {
          id: true,
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.messageReaction.count({ where: { messageId: message.id, emoji } }),
    ]);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return {
      users: page.map((row) => row.user),
      hasMore,
      total,
      // Keyset theo id hàng cảm xúc (không phải id user) — client phải dùng đúng cursor này.
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private parseReactionEmoji(rawEmoji: string): string {
    const parsed = reactionEmojiSchema.safeParse(rawEmoji);
    if (!parsed.success) {
      throw new BadRequestException({
        code: ErrorCodes.REACTION_EMOJI_INVALID,
        message: 'Emoji is not allowed',
      });
    }
    return parsed.data;
  }

  /** Tin phải còn sống; trả channel để phát realtime và giới hạn tần suất. */
  private async reactionTarget(messageId: string): Promise<{ id: string; channelId: string }> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
      select: { id: true, channelId: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }

  private async reactionSummary(
    messageId: string,
    viewerId: string,
  ): Promise<MessageReactionDto[]> {
    const map = await this.reactionMap([messageId], viewerId);
    return map.get(messageId) ?? [];
  }

  /**
   * Tổng hợp cảm xúc cho một trang tin bằng HAI truy vấn (không N+1): groupBy đếm theo
   * (messageId, emoji) + một truy vấn lấy hàng của người xem cho cờ `me`. Sắp theo số người
   * giảm dần rồi emoji để thứ tự ổn định giữa các client.
   */
  private async reactionMap(
    messageIds: string[],
    viewerId: string,
  ): Promise<Map<string, MessageReactionDto[]>> {
    const map = new Map<string, MessageReactionDto[]>();
    if (messageIds.length === 0) {
      return map;
    }
    const [counts, mine] = await Promise.all([
      this.prisma.messageReaction.groupBy({
        by: ['messageId', 'emoji'],
        where: { messageId: { in: messageIds } },
        _count: { _all: true },
      }),
      this.prisma.messageReaction.findMany({
        where: { messageId: { in: messageIds }, userId: viewerId },
        select: { messageId: true, emoji: true },
      }),
    ]);
    const mineByMessage = new Map<string, Set<string>>();
    for (const row of mine) {
      const set = mineByMessage.get(row.messageId) ?? new Set<string>();
      set.add(row.emoji);
      mineByMessage.set(row.messageId, set);
    }
    for (const row of counts) {
      const list = map.get(row.messageId) ?? [];
      list.push({
        emoji: row.emoji,
        count: row._count._all,
        me: mineByMessage.get(row.messageId)?.has(row.emoji) ?? false,
      });
      map.set(row.messageId, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0),
      );
    }
    return map;
  }

  private async getMessage(messageId: string) {
    // Tin đã xóa mềm coi như không còn: không sửa/xóa lại được.
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }
}

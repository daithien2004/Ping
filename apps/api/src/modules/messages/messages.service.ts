import { ForbiddenError, subject } from '@casl/ability';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CUSTOM_EMOJI_REACTION_TOKEN,
  CUSTOM_EMOJI_TOKEN_PATTERN,
  ErrorCodes,
  Limits,
  ServerEvents,
  reactionTokenSchema,
  type AppAbility,
  type CreateMessageInput,
  type MessageGifPreview,
  type MessagePinResult,
  type MessageReactionDto,
  type MessageReactionSummary,
  type MessageReplyPreview,
  type MessageStickerPreview,
  type ReactionUsersPage,
  type ReactionUsersQuery,
} from '@ping/shared';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
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
import { attachmentSelect, AttachmentsService } from '../attachments/attachments.service.js';

const messageWithAuthor = {
  id: true,
  content: true,
  nonce: true,
  editedAt: true,
  createdAt: true,
  authorId: true,
  kind: true,
  attachments: { select: attachmentSelect, where: { status: 'ready' as const } },
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  pinnedAt: true,
  pinnedById: true,
  sticker: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
      attachment: { select: { id: true, width: true, height: true } },
    },
  },
  gifUrl: true,
  gifWidth: true,
  gifHeight: true,
  gifProvider: true,
  replyTo: {
    select: {
      id: true,
      content: true,
      kind: true,
      deletedAt: true,
      author: { select: { displayName: true } },
      _count: { select: { attachments: { where: { status: 'ready' as const } } } },
    },
  },
} as const;

function replyPreview(
  replyTo: {
    id: string;
    content: string;
    kind: string;
    deletedAt: Date | null;
    author: { displayName: string };
    _count: { attachments: number };
  } | null,
): MessageReplyPreview | null {
  if (!replyTo) return null;
  const deleted = replyTo.deletedAt !== null;
  const attachmentCount = deleted ? 0 : replyTo._count.attachments;
  return {
    id: replyTo.id,
    authorName: replyTo.author.displayName,
    content: deleted ? '' : replyTo.content.slice(0, 120),
    deleted,
    kind: messageKind(replyTo.kind),
    ...(attachmentCount > 0 ? { attachmentCount } : {}),
  };
}

type StickerSelect = {
  id: string;
  name: string;
  deletedAt: Date | null;
  attachment: { id: string; width: number | null; height: number | null };
};

function stickerPreview(
  sticker: StickerSelect | null,
  urls: ReadonlyMap<string, { url: string; previewUrl: string }>,
): MessageStickerPreview | null {
  if (!sticker) return null;
  if (sticker.deletedAt !== null) {
    return {
      id: sticker.id,
      name: sticker.name,
      deleted: true,
      url: null,
      previewUrl: null,
      width: null,
      height: null,
    };
  }
  const pair = urls.get(sticker.attachment.id);
  return {
    id: sticker.id,
    name: sticker.name,
    deleted: false,
    url: pair?.url ?? null,
    previewUrl: pair?.previewUrl ?? null,
    width: sticker.attachment.width,
    height: sticker.attachment.height,
  };
}

async function replyPingMember(
  db: Prisma.TransactionClient,
  serverId: string,
  authorId: string,
  target: { authorId: string; deletedAt: Date | null },
): Promise<string | undefined> {
  if (target.deletedAt !== null || target.authorId === authorId) return undefined;
  const member = await db.member.findUnique({
    where: { serverId_userId: { serverId, userId: target.authorId } },
    select: { id: true },
  });
  return member?.id;
}

function messageKind(kind: string | null | undefined): 'text' | 'sticker' | 'gif' {
  if (kind === 'sticker') return 'sticker';
  if (kind === 'gif') return 'gif';
  return 'text';
}

type GifColumns = {
  gifUrl: string | null;
  gifWidth: number | null;
  gifHeight: number | null;
  gifProvider: string | null;
};

// `gifProvider` là cột String; API chỉ nhận host Tenor nên mọi giá trị khác quy về 'tenor' cho khớp literal DTO.
function gifPreview(row: GifColumns): MessageGifPreview | null {
  if (!row.gifUrl) return null;
  return {
    url: row.gifUrl,
    width: row.gifWidth ?? 0,
    height: row.gifHeight ?? 0,
    provider: (row.gifProvider ?? 'tenor') as MessageGifPreview['provider'],
  };
}

function toMessageDto<
  T extends {
    kind: string;
    replyTo: Parameters<typeof replyPreview>[0];
    sticker: StickerSelect | null;
  } & GifColumns,
>(
  row: T,
  reactions: MessageReactionDto[] = [],
  stickerUrls: ReadonlyMap<string, { url: string; previewUrl: string }> = new Map(),
) {
  const { replyTo, sticker, gifUrl, gifWidth, gifHeight, gifProvider, ...rest } = row;
  const gif = gifPreview({ gifUrl, gifWidth, gifHeight, gifProvider });
  return {
    ...rest,
    kind: messageKind(rest.kind),
    replyTo: replyPreview(replyTo),
    reactions,
    ...(sticker ? { sticker: stickerPreview(sticker, stickerUrls) } : {}),
    ...(gif ? { gif } : {}),
  };
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
    private readonly attachments: AttachmentsService,
  ) {}

  private async stickerUrlsFor(
    rows: Array<{ sticker: StickerSelect | null }>,
  ): Promise<ReadonlyMap<string, { url: string; previewUrl: string }>> {
    const ids = [
      ...new Set(
        rows
          .filter((row): row is { sticker: StickerSelect } => row.sticker?.deletedAt === null)
          .map((row) => row.sticker.attachment.id),
      ),
    ];
    return this.attachments.stickerUrlsMany(ids);
  }

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
      const [reactions, stickerUrls] = await Promise.all([
        this.reactionMap(
          page.map((message) => message.id),
          viewerId,
        ),
        this.stickerUrlsFor(page),
      ]);
      return {
        messages: page.map((message) =>
          toMessageDto(message, reactions.get(message.id) ?? [], stickerUrls),
        ),
        hasMore,
      };
    }

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: messageWithAuthor,
    });

    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;
    const [reactions, stickerUrls] = await Promise.all([
      this.reactionMap(
        page.map((message) => message.id),
        viewerId,
      ),
      this.stickerUrlsFor(page),
    ]);
    return {
      messages: page.map((message) =>
        toMessageDto(message, reactions.get(message.id) ?? [], stickerUrls),
      ),
      hasMore,
    };
  }

  private async listAround(channelId: string, aroundId: string, limit: number, viewerId: string) {
    const target = await this.prisma.message.findUnique({
      where: { id: aroundId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    // 404 cho cả ba trường hợp (không tồn tại, khác channel, đã xóa mềm) để không lộ id.
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
        take: newerLimit + 1,
        select: messageWithAuthor,
      }),
    ]);
    const hasMore = olderRows.length > olderLimit;
    const hasNewer = newerRows.length > newerLimit;
    const older = olderRows.slice(0, olderLimit);
    const newer = newerRows.slice(0, newerLimit).reverse();
    const page = [...newer, ...older];
    const [reactions, stickerUrls] = await Promise.all([
      this.reactionMap(
        page.map((message) => message.id),
        viewerId,
      ),
      this.stickerUrlsFor(page),
    ]);
    return {
      messages: page.map((message) =>
        toMessageDto(message, reactions.get(message.id) ?? [], stickerUrls),
      ),
      hasMore,
      hasNewer,
    };
  }

  async create(channelId: string, authorId: string, input: CreateMessageInput) {
    await this.rateLimiter.consume(authorId, channelId);
    const previous = await this.prisma.message.findUnique({
      where: { channelId_authorId_nonce: { channelId, authorId, nonce: input.nonce } },
      select: messageWithAuthor,
    });
    if (previous)
      return toMessageDto(
        previous,
        (await this.reactionMap([previous.id], authorId)).get(previous.id) ?? [],
        await this.stickerUrlsFor([previous]),
      );
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, type: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    // DM: kiểm UserBlock lúc gửi; cùng mã `DM_BLOCKED` với "đối phương tắt DM" để không dò nguyên nhân.
    let dmPartnerId: string | null = null;
    if (channel.type === 'DM') {
      const partner = await this.prisma.dmParticipant.findFirst({
        where: { channelId, userId: { not: authorId } },
        select: { userId: true },
      });
      if (!partner) {
        throw new ForbiddenException({
          code: ErrorCodes.DM_BLOCKED,
          message: 'DM is not allowed',
        });
      }
      dmPartnerId = partner.userId;
      const blocked = await this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: authorId, blockedId: partner.userId },
            { blockerId: partner.userId, blockedId: authorId },
          ],
        },
        select: { blockerId: true },
      });
      if (blocked) {
        throw new ForbiddenException({
          code: ErrorCodes.DM_BLOCKED,
          message: 'DM is not allowed',
        });
      }
    }
    const actor =
      channel.type === 'DM'
        ? null
        : await this.abilityFactory.contextFor(channel.serverId!, authorId);
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const attachmentIds = [...new Set(input.attachmentIds ?? [])].sort();
        for (const id of attachmentIds) {
          await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${id}::uuid FOR UPDATE`;
          const attachment = await tx.attachment.findUnique({ where: { id } });
          if (
            !attachment ||
            attachment.channelId !== channelId ||
            attachment.uploaderId !== authorId ||
            attachment.status !== 'ready' ||
            attachment.messageId !== null
          ) {
            throw new BadRequestException({
              code: ErrorCodes.ATTACHMENT_NOT_READY,
              message: 'Attachment unavailable',
            });
          }
        }
        if (input.stickerId !== undefined) {
          // Sticker là tài sản server: chặn CẢ gói hệ thống trong DM trước khi tra sticker để không lộ tồn tại.
          if (channel.type === 'DM') {
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message: 'Sticker unavailable',
            });
          }
          const sticker = await tx.sticker.findUnique({
            where: { id: input.stickerId },
            select: {
              deletedAt: true,
              pack: { select: { serverId: true } },
            },
          });
          if (
            !sticker ||
            sticker.deletedAt !== null ||
            (sticker.pack.serverId !== null && sticker.pack.serverId !== channel.serverId)
          ) {
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message: 'Sticker unavailable',
            });
          }
        }
        // Token custom emoji phải là emoji CÒN SỐNG của server channel (IDOR; 400 không lộ emoji server khác); token trỏ emoji
        // đã xóa cho qua (placeholder). Trong DM serverId NULL nên mọi custom emoji bị từ chối 400.
        const emojiIds = [
          ...new Set([...input.content.matchAll(CUSTOM_EMOJI_TOKEN_PATTERN)].map((m) => m[2])),
        ];
        for (const id of emojiIds) {
          const emoji = await tx.customEmoji.findFirst({ where: { id, deletedAt: null } });
          if (emoji && emoji.serverId !== channel.serverId) {
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message: 'Custom emoji unavailable',
            });
          }
        }
        let replyToId: string | undefined;
        let replyPingMemberId: string | undefined;
        if (input.replyToId !== undefined) {
          const original = await tx.message.findUnique({
            where: { id: input.replyToId },
            select: { id: true, channelId: true, authorId: true, deletedAt: true },
          });
          if (!original || original.channelId !== channelId) {
            throw new BadRequestException('Reply target must be in the same channel');
          }
          replyToId = original.id;
          if (actor !== null) {
            replyPingMemberId = await replyPingMember(tx, channel.serverId!, authorId, original);
          }
        }
        const created = await tx.message.create({
          // Prisma 7: field có giá trị `undefined` trong data là lỗi — spread có điều kiện.
          data: {
            channelId,
            authorId,
            content: input.content,
            nonce: input.nonce,
            ...(attachmentIds.length
              ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
              : {}),
            ...(input.stickerId !== undefined
              ? { kind: 'sticker', stickerId: input.stickerId }
              : {}),
            ...(input.gif
              ? {
                  kind: 'gif',
                  gifUrl: input.gif.url,
                  gifWidth: input.gif.width,
                  gifHeight: input.gif.height,
                  gifProvider: 'tenor',
                }
              : {}),
            ...(replyToId !== undefined ? { replyToId } : {}),
          },
          select: messageWithAuthor,
        });
        const mentions =
          actor === null
            ? []
            : await resolveMentions(
                tx,
                channel.serverId!, // luôn có (chỉ DM mới NULL)
                actor,
                extractMentionTokens(input.content),
              );
        // Reply ping dùng chung bảng MessageMention để unread đếm như mention; trùng @tác giả trong nội dung thì bỏ.
        if (
          replyPingMemberId &&
          !mentions.some(
            (mention) => mention.kind === 'user' && mention.mentionedMemberId === replyPingMemberId,
          )
        ) {
          mentions.push({ kind: 'user', mentionedMemberId: replyPingMemberId });
        }
        if (mentions.length > 0) {
          await tx.messageMention.createMany({
            data: mentions.map((mention) => ({ messageId: created.id, ...mention })),
          });
        }
        const createdGif = gifPreview(created);
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
            kind: messageKind(created.kind),
            ...(created.sticker
              ? { sticker: stickerPreview(created.sticker, await this.stickerUrlsFor([created])) }
              : {}),
            ...(createdGif ? { gif: createdGif } : {}),
            replyTo: replyPreview(created.replyTo),
            attachments: created.attachments,
          },
        });
        return created;
      });
      const stickerUrls = await this.stickerUrlsFor([message]);
      const messageGif = gifPreview(message);
      this.realtime.emitToChannel(channelId, ServerEvents.MessageCreated, {
        id: message.id,
        channelId,
        authorId,
        author: message.author,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        nonce: message.nonce,
        kind: messageKind(message.kind),
        ...(message.sticker ? { sticker: stickerPreview(message.sticker, stickerUrls) } : {}),
        ...(messageGif ? { gif: messageGif } : {}),
        replyTo: replyPreview(message.replyTo),
        attachments: message.attachments,
      });
      // Metadata (không nội dung) tới room server cho badge unread; DM đi qua room `user:<đối tác>` với serverId null.
      if (dmPartnerId !== null) {
        this.realtime.emitToUser(dmPartnerId, ServerEvents.ChannelActivity, {
          channelId,
          serverId: null,
          messageId: message.id,
          authorId,
        });
      } else {
        this.realtime.emitToServer(channel.serverId!, ServerEvents.ChannelActivity, {
          channelId,
          serverId: channel.serverId!, // luôn có (chỉ DM mới NULL)
          messageId: message.id,
          authorId,
        });
      }
      // Ping riêng người được mention: không chặn response, tin đã commit nên ping lỗi không làm hỏng đường gửi.
      if (channel.serverId !== null) {
        void this.notifyMentionedUsers(message.id, channelId, channel.serverId).catch(
          () => undefined,
        );
      }
      return toMessageDto(message, [], stickerUrls);
    } catch (error) {
      // Retry cùng nonce → unique (channelId, authorId, nonce) chặn: trả tin cũ, không phát event lần hai.
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.message.findUniqueOrThrow({
          where: { channelId_authorId_nonce: { channelId, authorId, nonce: input.nonce } },
          select: messageWithAuthor,
        });
        const [reactions, stickerUrls] = await Promise.all([
          this.reactionMap([existing.id], authorId),
          this.stickerUrlsFor([existing]),
        ]);
        return toMessageDto(existing, reactions.get(existing.id) ?? [], stickerUrls);
      }
      throw error;
    }
  }

  async update(messageId: string, ability: AppAbility, content: string, viewerId: string) {
    const message = await this.getMessage(messageId);
    // Tier 2: rule `update Message WHERE authorId = me` chỉ kiểm được khi đã có đối tượng thật.
    ForbiddenError.from(ability).throwUnlessCan('update', subject('Message', message));

    if (message.kind === 'sticker') {
      throw new BadRequestException('Sticker messages cannot be edited');
    }

    if (message.kind === 'gif') {
      throw new BadRequestException('Gif messages cannot be edited');
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { serverId: true, type: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    const actor =
      channel.type === 'DM'
        ? null
        : await this.abilityFactory.contextFor(channel.serverId!, message.authorId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.update({
        where: { id: message.id },
        data: { content, editedAt: new Date() },
        select: messageWithAuthor,
      });
      // Sửa nội dung xoá rồi ghi lại toàn bộ mention nên reply ping phải dựng lại, chỉ khi tin từng ping tác giả gốc;
      // không phát lại `mention.created`.
      const replyTarget =
        actor === null || message.replyToId === null
          ? null
          : await tx.message.findUnique({
              where: { id: message.replyToId },
              select: { authorId: true, deletedAt: true },
            });
      const replyPingMemberId = replyTarget
        ? await replyPingMember(tx, channel.serverId!, message.authorId, replyTarget)
        : undefined;
      const keepReplyPing =
        replyPingMemberId !== undefined &&
        (await tx.messageMention.findFirst({
          where: {
            messageId: message.id,
            kind: 'user',
            mentionedMemberId: replyPingMemberId,
          },
          select: { id: true },
        })) !== null;
      await tx.messageMention.deleteMany({ where: { messageId: message.id } });
      const mentions =
        actor === null
          ? []
          : await resolveMentions(
              tx,
              channel.serverId!, // luôn có (chỉ DM mới NULL)
              actor,
              extractMentionTokens(content),
            );
      if (
        keepReplyPing &&
        replyPingMemberId &&
        !mentions.some(
          (mention) => mention.kind === 'user' && mention.mentionedMemberId === replyPingMemberId,
        )
      ) {
        mentions.push({ kind: 'user', mentionedMemberId: replyPingMemberId });
      }
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
    return toMessageDto(
      updated,
      reactions.get(updated.id) ?? [],
      await this.stickerUrlsFor([updated]),
    );
  }

  // Chỉ người còn xem được channel mới nhận (kiểm ability): không ping kẻ không được đọc.
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
        // Không còn là member giữa chừng: bỏ qua.
      }
    }
  }

  async remove(messageId: string, actorId: string, ability: AppAbility): Promise<{ id: string }> {
    const message = await this.getMessage(messageId);
    ForbiddenError.from(ability).throwUnlessCan('delete', subject('Message', message));

    // Soft delete: row phải còn để biết nó từng tồn tại; outbox ghi cùng transaction để indexer nhận được cả khi realtime lỗi.
    const deletedPayload = { id: message.id, channelId: message.channelId };
    if (message.authorId === actorId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          // Tin bị xóa thì bỏ ghim: trần 50 chỉ đếm tin còn sống.
          data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null },
        });
        await this.outbox.write(tx, {
          aggregateType: 'Message',
          aggregateId: message.id,
          type: ServerEvents.MessageDeleted,
          payload: deletedPayload,
        });
      });
    } else {
      const { serverId } = await this.prisma.channel.findUniqueOrThrow({
        where: { id: message.channelId },
        select: { serverId: true },
      });
      // Chỉ channel server vào nhánh này (DM không cấp `delete Message` cho người khác); serverId NULL là lệch dữ liệu → fail-closed 404.
      if (serverId === null) {
        throw new NotFoundException('Channel not found');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null },
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

  // Trần `Limits.PINS_PER_CHANNEL` giữ dưới advisory lock theo channel để hai instance không cùng vượt trần.
  async pin(messageId: string, actorId: string): Promise<MessagePinResult> {
    const target = await this.pinTarget(messageId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target.channelId}))`;
      const current = await tx.message.findUniqueOrThrow({
        where: { id: messageId },
        select: { pinnedAt: true, pinnedById: true },
      });
      if (current.pinnedAt) {
        return { changed: false, pinnedAt: current.pinnedAt, pinnedById: current.pinnedById };
      }
      const pinned = await tx.message.count({
        where: { channelId: target.channelId, deletedAt: null, pinnedAt: { not: null } },
      });
      if (pinned >= Limits.PINS_PER_CHANNEL) {
        throw new BadRequestException({
          code: ErrorCodes.PIN_LIMIT_REACHED,
          message: `At most ${Limits.PINS_PER_CHANNEL} pinned messages per channel`,
        });
      }
      const pinnedAt = new Date();
      await tx.message.update({
        where: { id: messageId },
        data: { pinnedAt, pinnedById: actorId },
      });
      // DM không có AuditLog (serverId bắt buộc): ghim trong DM bỏ qua sổ.
      if (target.serverId !== null) {
        await this.audit.record(
          {
            serverId: target.serverId,
            actorId,
            action: 'MESSAGE_PIN',
            targetId: messageId,
            metadata: { channelId: target.channelId },
          },
          tx,
        );
      }
      return { changed: true, pinnedAt, pinnedById: actorId };
    });

    if (outcome.changed) {
      this.realtime.emitToChannel(target.channelId, ServerEvents.MessagePinned, {
        messageId,
        channelId: target.channelId,
        pinnedById: outcome.pinnedById ?? actorId,
        pinnedAt: outcome.pinnedAt.toISOString(),
      });
    }
    return {
      messageId,
      channelId: target.channelId,
      pinnedAt: outcome.pinnedAt ? outcome.pinnedAt.toISOString() : null,
      pinnedById: outcome.pinnedById,
    };
  }

  async unpin(messageId: string, actorId: string): Promise<MessagePinResult> {
    const target = await this.pinTarget(messageId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target.channelId}))`;
      const current = await tx.message.findUniqueOrThrow({
        where: { id: messageId },
        select: { pinnedAt: true },
      });
      if (!current.pinnedAt) {
        return { changed: false };
      }
      await tx.message.update({
        where: { id: messageId },
        data: { pinnedAt: null, pinnedById: null },
      });
      if (target.serverId !== null) {
        await this.audit.record(
          {
            serverId: target.serverId,
            actorId,
            action: 'MESSAGE_UNPIN',
            targetId: messageId,
            metadata: { channelId: target.channelId },
          },
          tx,
        );
      }
      return { changed: true };
    });

    if (outcome.changed) {
      this.realtime.emitToChannel(target.channelId, ServerEvents.MessageUnpinned, {
        messageId,
        channelId: target.channelId,
      });
    }
    return { messageId, channelId: target.channelId, pinnedAt: null, pinnedById: null };
  }

  async listPins(channelId: string, viewerId: string) {
    const rows = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null, pinnedAt: { not: null } },
      orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
      take: Limits.PINS_PER_CHANNEL,
      select: {
        ...messageWithAuthor,
        pinnedBy: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const [reactions, stickerUrls] = await Promise.all([
      this.reactionMap(
        rows.map((row) => row.id),
        viewerId,
      ),
      this.stickerUrlsFor(rows),
    ]);
    return rows.map(({ pinnedBy, ...row }) => ({
      message: toMessageDto(row, reactions.get(row.id) ?? [], stickerUrls),
      pinnedAt: row.pinnedAt?.toISOString() ?? '',
      pinnedBy: pinnedBy ?? null,
    }));
  }

  private async pinTarget(
    messageId: string,
  ): Promise<{ id: string; channelId: string; serverId: string | null }> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
      select: { id: true, channelId: true, channel: { select: { serverId: true } } },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return { id: message.id, channelId: message.channelId, serverId: message.channel.serverId };
  }

  async addReaction(
    messageId: string,
    userId: string,
    rawEmoji: string,
  ): Promise<MessageReactionSummary> {
    const emoji = this.parseReactionEmoji(rawEmoji);
    const message = await this.reactionTarget(messageId);
    await this.reactionLimiter.consume(userId, message.channelId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize reaction writes per message across instances: cap/count must be computed after the previous writer commits.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${messageId}))`;
      await this.assertCustomReactionEmoji(tx, emoji, message.serverId);
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
      // Gỡ token custom vẫn kiểm đúng server; emoji ĐÃ XÓA vẫn cho gỡ (cảm xúc được giữ lại); `deleteMany` giới hạn theo
      // `userId` của người gọi.
      await this.assertCustomReactionEmoji(tx, emoji, message.serverId, { allowDeleted: true });
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
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  // `c:<id>` dài 38 ký tự, vượt trần 32 của unicode nên schema có nhánh riêng; ngữ nghĩa kiểm ở caller qua `assertCustomReactionEmoji`.
  private parseReactionEmoji(rawEmoji: string): string {
    const parsed = reactionTokenSchema.safeParse(rawEmoji);
    if (!parsed.success) {
      throw new BadRequestException({
        code: ErrorCodes.REACTION_EMOJI_INVALID,
        message: 'Emoji is not allowed',
      });
    }
    return parsed.data;
  }

  // Sai hình thức hay sai server đều trả cùng mã REACTION_EMOJI_INVALID (không lộ emoji server khác); trong DM mọi token custom bị chặn.
  private async assertCustomReactionEmoji(
    tx: Prisma.TransactionClient,
    emoji: string,
    serverId: string | null,
    options: { allowDeleted?: boolean } = {},
  ): Promise<void> {
    const match = CUSTOM_EMOJI_REACTION_TOKEN.exec(emoji);
    if (!match) return;
    if (serverId === null) {
      throw new BadRequestException({
        code: ErrorCodes.REACTION_EMOJI_INVALID,
        message: 'Emoji is not allowed',
      });
    }
    // `allowDeleted` (chỉ khi GỠ): bỏ điều kiện còn sống nhưng vẫn đòi đúng server.
    const live = await tx.customEmoji.findFirst({
      where: {
        id: match[1],
        serverId,
        ...(options.allowDeleted ? {} : { deletedAt: null }),
      },
      select: { id: true },
    });
    if (!live) {
      throw new BadRequestException({
        code: ErrorCodes.REACTION_EMOJI_INVALID,
        message: 'Emoji is not allowed',
      });
    }
  }

  private async reactionTarget(
    messageId: string,
  ): Promise<{ id: string; channelId: string; serverId: string | null }> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
      select: { id: true, channelId: true, channel: { select: { serverId: true } } },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return { id: message.id, channelId: message.channelId, serverId: message.channel.serverId };
  }

  private async reactionSummary(
    messageId: string,
    viewerId: string,
  ): Promise<MessageReactionDto[]> {
    const map = await this.reactionMap([messageId], viewerId);
    return map.get(messageId) ?? [];
  }

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
    const customIds = new Set<string>();
    for (const row of counts) {
      const match = CUSTOM_EMOJI_REACTION_TOKEN.exec(row.emoji);
      if (match) customIds.add(match[1]);
    }
    const nameById = new Map<string, string>();
    if (customIds.size > 0) {
      const emojis = await this.prisma.customEmoji.findMany({
        where: { id: { in: [...customIds] } },
        select: { id: true, name: true },
      });
      for (const emoji of emojis) nameById.set(emoji.id, emoji.name);
    }
    for (const row of counts) {
      const list = map.get(row.messageId) ?? [];
      const customId = CUSTOM_EMOJI_REACTION_TOKEN.exec(row.emoji)?.[1];
      const emojiName = customId ? nameById.get(customId) : undefined;
      list.push({
        emoji: row.emoji,
        count: row._count._all,
        me: mineByMessage.get(row.messageId)?.has(row.emoji) ?? false,
        ...(emojiName ? { emojiName } : {}),
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
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }
}

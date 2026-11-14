import { z } from 'zod';
import type { MessageAuthor } from '../events';
import { Limits } from '../limits';
import { AttachmentLimits, type AttachmentDto } from './attachment';
import { gifPayloadSchema, type MessageGifPreview } from './gif';
import type { MessageStickerPreview } from './sticker';

export const createMessageSchema = z
  .object({
    content: z.string().trim().max(Limits.MESSAGE_CONTENT_MAX),
    // The client reuses this nonce when retrying the same message.
    nonce: z.uuid(),
    replyToId: z.uuid().optional(),
    attachmentIds: z.array(z.uuid()).max(AttachmentLimits.PER_MESSAGE).optional(),
    stickerId: z.uuid().optional(),
    gif: gifPayloadSchema.optional(),
  })
  .refine(
    (input) =>
      input.content.length > 0 ||
      (input.attachmentIds?.length ?? 0) > 0 ||
      input.stickerId !== undefined ||
      input.gif !== undefined,
  )
  .refine((input) => input.stickerId === undefined || input.content === '', {
    message: 'Sticker message must have empty content',
  })
  .refine((input) => input.stickerId === undefined || (input.attachmentIds?.length ?? 0) === 0, {
    message: 'Sticker message cannot carry message attachments',
  })
  .refine((input) => input.stickerId === undefined || input.gif === undefined, {
    message: 'Message cannot be both sticker and gif',
  })
  .refine((input) => input.gif === undefined || input.content === '', {
    message: 'Gif message must have empty content',
  })
  .refine((input) => input.gif === undefined || (input.attachmentIds?.length ?? 0) === 0, {
    message: 'Gif message cannot carry message attachments',
  });
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

/** Đoạn trích 120 ký tự; `deleted` khi tin gốc soft-delete. */
export interface MessageReplyPreview {
  id: string;
  authorName: string;
  content: string;
  deleted: boolean;
  /** Thiếu (client/dữ liệu cũ) được coi là tin văn bản. */
  kind?: 'text' | 'sticker' | 'gif';
  /** Chỉ có mặt khi lớn hơn 0. */
  attachmentCount?: number;
}

export const updateMessageSchema = z.object({
  content: z.string().trim().min(1).max(Limits.MESSAGE_CONTENT_MAX),
});
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export interface MessageReactionDto {
  emoji: string;
  count: number;
  me: boolean;
  /** Có cả khi emoji đã bị xóa; thiếu với emoji Unicode. */
  emojiName?: string;
}

export interface MessageReactionSummary {
  messageId: string;
  reactions: MessageReactionDto[];
}

/** `nextCursor` là id hàng cảm xúc cuối trang (không phải id user); `null` khi hết. */
export interface ReactionUsersPage {
  users: MessageAuthor[];
  hasMore: boolean;
  total: number;
  nextCursor: string | null;
}

export const reactionUsersQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReactionUsersQuery = z.infer<typeof reactionUsersQuerySchema>;

/** Tin cũ không có `kind`: client coi thiếu `kind` là text. */
export interface MessageDto {
  kind?: 'text' | 'sticker' | 'gif';
  sticker?: MessageStickerPreview | null;
  gif?: MessageGifPreview | null;
  attachments?: AttachmentDto[];
  id: string;
  content: string;
  nonce: string | null;
  editedAt: string | null;
  createdAt: string;
  authorId: string;
  author: MessageAuthor;
  replyTo: MessageReplyPreview | null;
  reactions: MessageReactionDto[];
  pinnedAt: string | null;
  pinnedById: string | null;
}

export interface PinnedMessageDto {
  message: MessageDto;
  pinnedAt: string;
  pinnedBy: MessageAuthor | null;
}

export interface MessagePinResult {
  messageId: string;
  channelId: string;
  pinnedAt: string | null;
  pinnedById: string | null;
}

/** `hasNewer` chỉ có ở chế độ `?around=`: còn tin mới hơn bên dưới cửa sổ. */
export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
  hasNewer?: boolean;
}

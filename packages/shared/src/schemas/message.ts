import { z } from 'zod';
import type { MessageAuthor } from '../events';
import { AttachmentLimits, type AttachmentDto } from './attachment';
import { gifPayloadSchema, type MessageGifPreview } from './gif';
import type { MessageStickerPreview } from './sticker';

export const createMessageSchema = z
  .object({
    content: z.string().trim().max(4000),
    // The client reuses this nonce when retrying the same message.
    nonce: z.uuid(),
    // TG.1: reply — tin gốc CÙNG channel (service kiểm); bỏ qua = tin thường.
    replyToId: z.uuid().optional(),
    attachmentIds: z.array(z.uuid()).max(AttachmentLimits.PER_MESSAGE).optional(),
    // TG.22: gửi sticker — tin `kind='sticker'`, nội dung bắt buộc rỗng, không kèm tệp tin nhắn.
    stickerId: z.uuid().optional(),
    // TG.25: gửi GIF — tin `kind='gif'`, nội dung bắt buộc rỗng, URL thuộc host allowlist.
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

/** Xem trước tin gốc trong reply (TG.1): đoạn trích 120 ký tự; `deleted` khi tin gốc soft-delete. */
export interface MessageReplyPreview {
  id: string;
  authorName: string;
  content: string;
  deleted: boolean;
}

export const updateMessageSchema = z.object({ content: z.string().trim().min(1).max(4000) });
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

/** Một loại cảm xúc trên tin (TG.2, ADR-0064): tổng số + người xem đã thả chưa. */
export interface MessageReactionDto {
  emoji: string;
  count: number;
  me: boolean;
}

/** Kết quả thêm/gỡ cảm xúc: toàn bộ nhóm cảm xúc hiện tại của tin (để client hoà giải). */
export interface MessageReactionSummary {
  messageId: string;
  reactions: MessageReactionDto[];
}

/**
 * Danh sách người thả một cảm xúc, keyset tăng dần theo id; `total` = tổng số người.
 * `nextCursor` là id hàng cảm xúc cuối trang (không phải id user) — truyền lại qua `after`
 * để lấy trang kế; `null` khi hết.
 */
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

/**
 * Tin nhắn từ API (GET danh sách, POST gửi). Ngày giờ là chuỗi ISO 8601 qua JSON.
 * `kind`/`sticker` (TG.22): tin sticker có `kind='sticker'` kèm preview; tin cũ trước
 * bản deploy không có `kind` — client coi thiếu `kind` là `'text'`.
 */
export interface MessageDto {
  kind?: 'text' | 'sticker' | 'gif';
  /** Xem trước sticker khi `kind='sticker'`; tin văn bản không có. */
  sticker?: MessageStickerPreview | null;
  /** TG.25: xem trước GIF khi `kind='gif'`; tin khác không có. */
  gif?: MessageGifPreview | null;
  attachments?: AttachmentDto[];
  id: string;
  content: string;
  /** Nonce client sinh khi gửi (null với tin không có). Dùng khớp tin optimistic với tin thật. */
  nonce: string | null;
  editedAt: string | null;
  createdAt: string;
  authorId: string;
  author: MessageAuthor;
  /** TG.1: tin gốc nếu đây là reply; null = tin thường. */
  replyTo: MessageReplyPreview | null;
  /** TG.2: cảm xúc đã tổng hợp (count + me), sắp theo số người giảm dần. */
  reactions: MessageReactionDto[];
  /** TG.3: thời điểm ghim; null = chưa ghim (ADR-0066). */
  pinnedAt: string | null;
  /** TG.3: người ghim gần nhất; null = chưa ghim hoặc tài khoản đã bị xoá. */
  pinnedById: string | null;
}

/**
 * Một tin trong danh sách ghim của channel (TG.3). `pinnedBy` là người ghim; null khi tài
 * khoản đó đã bị xoá. Danh sách có trần `Limits.PINS_PER_CHANNEL` nên trả mảng, không cursor.
 */
export interface PinnedMessageDto {
  message: MessageDto;
  pinnedAt: string;
  pinnedBy: MessageAuthor | null;
}

/** Kết quả ghim/bỏ ghim (idempotent): trạng thái sau thao tác. */
export interface MessagePinResult {
  messageId: string;
  channelId: string;
  pinnedAt: string | null;
  pinnedById: string | null;
}

/**
 * GET /channels/:id/messages: mới nhất trước; `hasMore` = còn tin cũ hơn tin cuối trang.
 * `hasNewer` chỉ có ở chế độ `?around=` (TG.5): cửa sổ quanh một tin cũ, còn tin MỚI hơn ở dưới
 * (tải tiếp bằng `after` = tin mới nhất của cửa sổ).
 */
export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
  hasNewer?: boolean;
}

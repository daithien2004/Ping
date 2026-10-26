import { z } from 'zod';
import type { MessageAuthor } from '../events';

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  // The client reuses this nonce when retrying the same message.
  nonce: z.uuid(),
  // TG.1: reply — tin gốc CÙNG channel (service kiểm); bỏ qua = tin thường.
  replyToId: z.uuid().optional(),
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

/** Tin nhắn từ API (GET danh sách, POST gửi). Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface MessageDto {
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

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
}

/** GET /channels/:id/messages: mới nhất trước; `hasMore` = còn tin cũ hơn tin cuối trang. */
export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
}

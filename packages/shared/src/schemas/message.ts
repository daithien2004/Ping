import { z } from 'zod';
import type { MessageAuthor } from '../events';

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  // The client reuses this nonce when retrying the same message.
  nonce: z.uuid(),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

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
}

/** GET /channels/:id/messages: mới nhất trước; `hasMore` = còn tin cũ hơn tin cuối trang. */
export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
}

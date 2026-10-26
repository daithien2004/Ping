import type {
  CreateMessageInput,
  MessageDto,
  MessagePage,
  MessageReactionSummary,
  ReactionUsersPage,
  UpdateMessageInput,
} from '@ping/shared';
import { api } from '@/lib/api-client';

/** Một trang tin (mới nhất trước). `before` = id tin cũ nhất đang có → lấy trang cũ hơn (cursor). */
export const listMessages = (channelId: string, before?: string) =>
  api.get<MessagePage>(
    `/channels/${channelId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

/**
 * Trang tin MỚI HƠN cursor, thứ tự tăng dần (T4.4, ADR-0044) — vá khoảng trống sau reconnect.
 * `hasMore` = còn tin mới hơn nữa: gọi tiếp với `after` = id cuối trang vừa trả.
 */
export const listMessagesAfter = (channelId: string, after: string) =>
  api.get<MessagePage>(`/channels/${channelId}/messages?after=${encodeURIComponent(after)}`);

/**
 * TG.5: cửa sổ quanh một tin cho permalink — `hasMore` = còn tin cũ hơn, `hasNewer` = còn tin
 * mới hơn (tải tiếp bằng `listMessagesAfter` với tin mới nhất của cửa sổ).
 */
export const listMessagesAround = (channelId: string, around: string, limit = 50) =>
  api.get<MessagePage>(
    `/channels/${channelId}/messages?around=${encodeURIComponent(around)}&limit=${limit}`,
  );

/** Gửi lại với CÙNG nonce là an toàn: server trả lại tin đã tạo thay vì tạo bản thứ hai. */
export const sendMessage = (channelId: string, input: CreateMessageInput) =>
  api.post<MessageDto>(`/channels/${channelId}/messages`, input);

export const editMessageRequest = (id: string, input: UpdateMessageInput) =>
  api.patch<MessageDto>(`/messages/${id}`, input);
export const deleteMessageRequest = (id: string) => api.delete<{ id: string }>(`/messages/${id}`);

/**
 * TG.2: thêm/gỡ cảm xúc — `PUT`/`DELETE` idempotent, trả TOÀN BỘ nhóm cảm xúc hiện tại của tin
 * để client hoà giải thay vì tự đoán count.
 */
export const addReactionRequest = (messageId: string, emoji: string) =>
  api.put<MessageReactionSummary>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
export const removeReactionRequest = (messageId: string, emoji: string) =>
  api.delete<MessageReactionSummary>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
  );

/** Danh sách người thả một emoji, keyset bằng `nextCursor` của trang trước. */
export const listReactionUsers = (messageId: string, emoji: string, after?: string) =>
  api.get<ReactionUsersPage>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}${
      after ? `?after=${encodeURIComponent(after)}` : ''
    }`,
  );

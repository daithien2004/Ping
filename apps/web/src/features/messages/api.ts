import type { CreateMessageInput, MessageDto, MessagePage, UpdateMessageInput } from '@ping/shared';
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

/** Gửi lại với CÙNG nonce là an toàn: server trả lại tin đã tạo thay vì tạo bản thứ hai. */
export const sendMessage = (channelId: string, input: CreateMessageInput) =>
  api.post<MessageDto>(`/channels/${channelId}/messages`, input);

export const editMessageRequest = (id: string, input: UpdateMessageInput) =>
  api.patch<MessageDto>(`/messages/${id}`, input);
export const deleteMessageRequest = (id: string) => api.delete<{ id: string }>(`/messages/${id}`);

import type { CreateMessageInput, MessageDto, MessagePage } from '@ping/shared';
import { api } from '@/lib/api-client';

/** Một trang tin (mới nhất trước). `before` = id tin cũ nhất đang có → lấy trang cũ hơn (cursor). */
export const listMessages = (channelId: string, before?: string) =>
  api.get<MessagePage>(
    `/channels/${channelId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

/** Gửi lại với CÙNG nonce là an toàn: server trả lại tin đã tạo thay vì tạo bản thứ hai. */
export const sendMessage = (channelId: string, input: CreateMessageInput) =>
  api.post<MessageDto>(`/channels/${channelId}/messages`, input);

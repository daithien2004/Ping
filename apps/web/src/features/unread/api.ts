import type { ServerUnreadDto } from '@ping/shared';
import { api } from '@/lib/api-client';

/**
 * GET /users/me/unread — unread của mọi server người gọi là thành viên trong một request
 * (ADR-0077). Endpoint per-server cũ vẫn tồn tại cho client khác; web chỉ dùng bản gộp.
 */
export const listAllUnread = () => api.get<ServerUnreadDto[]>('/users/me/unread');

/**
 * PUT /channels/:channelId/read — đánh dấu đã đọc đến `messageId` (T4.2). 204, không body;
 * server chỉ tiến cursor và tự phát `read.updated` tới các tab khác.
 */
export const markChannelRead = (channelId: string, messageId: string) =>
  api.put<void>(`/channels/${channelId}/read`, { messageId });

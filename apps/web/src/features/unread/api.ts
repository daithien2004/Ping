import type { ChannelUnreadDto } from '@ping/shared';
import { api } from '@/lib/api-client';

/** GET /servers/:serverId/unread — một dòng mỗi channel (T4.2). */
export const listUnread = (serverId: string) =>
  api.get<ChannelUnreadDto[]>(`/servers/${serverId}/unread`);

/**
 * PUT /channels/:channelId/read — đánh dấu đã đọc đến `messageId` (T4.2). 204, không body;
 * server chỉ tiến cursor và tự phát `read.updated` tới các tab khác.
 */
export const markChannelRead = (channelId: string, messageId: string) =>
  api.put<void>(`/channels/${channelId}/read`, { messageId });

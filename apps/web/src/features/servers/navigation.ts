import { channelUrl, messageUrl, ownerUrl } from '@/lib/channel-url';

export const serverPath = (serverId: string) => ownerUrl(serverId);

export const channelPath = (serverId: string, channelId: string) => channelUrl(serverId, channelId);

export const messagePath = (serverId: string, channelId: string, messageId: string) =>
  messageUrl(serverId, channelId, messageId);

/** Trang chủ: vào server đầu tiên nếu có; null = chưa có server nào (hiện màn hình trống). */
export function homePath(servers: readonly { id: string }[]): string | null {
  const first = servers[0];
  return first ? serverPath(first.id) : null;
}

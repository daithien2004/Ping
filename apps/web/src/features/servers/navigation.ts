import { channelUrl, messageUrl, ownerUrl } from '@/lib/channel-url';

/** URL công khai kiểu Discord `/channels/:serverId` (ADR-0088). */
export const serverPath = (serverId: string) => ownerUrl(serverId);

export const channelPath = (serverId: string, channelId: string) => channelUrl(serverId, channelId);

/** TG.5: permalink của một tin — mở channel ở cửa sổ quanh tin đó (ADR-0063, URL ADR-0088). */
export const messagePath = (serverId: string, channelId: string, messageId: string) =>
  messageUrl(serverId, channelId, messageId);

/** Trang chủ: vào server đầu tiên nếu có; null = chưa có server nào (hiện màn hình trống). */
export function homePath(servers: readonly { id: string }[]): string | null {
  const first = servers[0];
  return first ? serverPath(first.id) : null;
}

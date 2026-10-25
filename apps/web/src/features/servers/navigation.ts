export const serverPath = (serverId: string) => `/servers/${serverId}`;

export const channelPath = (serverId: string, channelId: string) =>
  `/servers/${serverId}/channels/${channelId}`;

/** TG.5: permalink của một tin — mở channel ở cửa sổ quanh tin đó (ADR-0061). */
export const messagePath = (serverId: string, channelId: string, messageId: string) =>
  `${channelPath(serverId, channelId)}/messages/${messageId}`;

/** Trang chủ: vào server đầu tiên nếu có; null = chưa có server nào (hiện màn hình trống). */
export function homePath(servers: readonly { id: string }[]): string | null {
  const first = servers[0];
  return first ? serverPath(first.id) : null;
}

/**
 * URL công khai kiểu Discord (ADR-0088): `/channels/{serverId|@me}/{channelId}[/{messageId}]`.
 *
 * `@me` đứng ở ô chủ sở hữu cho DM: DM không thuộc server nào (ADR-0070) nên không có serverId,
 * đúng như Discord dùng sentinel này thay guildId. Route nội bộ vẫn là `/servers/...` và `/dms/...`;
 * next.config rewrite URL công khai sang route đó nên layout, params của page và `<Activity>` giữ nguyên.
 */
export const ME_SEGMENT = '@me';

export function ownerUrl(owner: string): string {
  return `/channels/${owner}`;
}

export function channelUrl(owner: string, channelId: string): string {
  return `${ownerUrl(owner)}/${channelId}`;
}

export function messageUrl(owner: string, channelId: string, messageId: string): string {
  return `${channelUrl(owner, channelId)}/${messageId}`;
}

export function serverIdFromPath(pathname: string): string | null {
  const owner = /^\/(?:channels|servers)\/([^/]+)/.exec(pathname)?.[1];
  return owner && owner !== ME_SEGMENT ? owner : null;
}

export function channelIdFromPath(pathname: string): string | null {
  return /^\/channels\/[^/]+\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

export function isDmPath(pathname: string): boolean {
  const root = ownerUrl(ME_SEGMENT);
  return pathname === root || pathname.startsWith(`${root}/`);
}

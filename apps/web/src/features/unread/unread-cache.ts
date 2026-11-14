import type { ChannelUnreadDto, ServerUnreadDto } from '@ping/shared';

/**
 * Logic biến đổi cache unread (T4.3) — hàm thuần, có test riêng (quy tắc FE: server state
 * chỉ ghi cache trong hooks.ts, biến đổi nằm ở đây).
 *
 * Bộ đếm phía client là **ước lượng tối thiểu** cho badge realtime: chỉ tăng theo event,
 * đối soát lại bằng GET unread khi socket reconnect. Chênh lệch tự sửa ở lần fetch sau.
 */

export interface UnreadTotals {
  unreadTotal: number;
  mentionTotal: number;
}

const cap = (value: number) => Math.min(value, 100);

export interface IncomingOptions {
  isOwn: boolean;
  mention: boolean;
  countsUnread?: boolean;
}

export function applyIncoming(
  unread: ChannelUnreadDto[],
  channelId: string,
  { isOwn, mention, countsUnread = true }: IncomingOptions,
): ChannelUnreadDto[] {
  const index = unread.findIndex((row) => row.channelId === channelId);
  if (index < 0) {
    return unread;
  }
  const row = unread[index]!;
  const next: ChannelUnreadDto = {
    ...row,
    unreadCount: isOwn || !countsUnread ? row.unreadCount : cap(row.unreadCount + 1),
    mentionCount: mention ? cap(row.mentionCount + 1) : row.mentionCount,
  };
  return [...unread.slice(0, index), next, ...unread.slice(index + 1)];
}

export function applyRead(
  unread: ChannelUnreadDto[],
  channelId: string,
  lastReadMessageId: string,
): ChannelUnreadDto[] {
  return unread.map((row) =>
    row.channelId === channelId
      ? { ...row, unreadCount: 0, mentionCount: 0, lastReadMessageId }
      : row,
  );
}

/**
 * Bản gộp một request của `applyIncoming` (ADR-0077): tìm server chứa channel rồi chỉ thay
 * đúng server đó. Không tìm thấy (server chưa nằm trong cache gộp) giữ nguyên mảng — lần
 * fetch sau tự đúng.
 */
export function applyIncomingAll(
  servers: ServerUnreadDto[],
  channelId: string,
  options: IncomingOptions,
): ServerUnreadDto[] {
  const index = servers.findIndex((server) =>
    server.channels.some((row) => row.channelId === channelId),
  );
  if (index < 0) return servers;
  const server = servers[index]!;
  const next = { ...server, channels: applyIncoming(server.channels, channelId, options) };
  return [...servers.slice(0, index), next, ...servers.slice(index + 1)];
}

/** Bản gộp một request của `applyRead` (ADR-0077). */
export function applyReadAll(
  servers: ServerUnreadDto[],
  channelId: string,
  lastReadMessageId: string,
): ServerUnreadDto[] {
  const index = servers.findIndex((server) =>
    server.channels.some((row) => row.channelId === channelId),
  );
  if (index < 0) return servers;
  const server = servers[index]!;
  const next = { ...server, channels: applyRead(server.channels, channelId, lastReadMessageId) };
  return [...servers.slice(0, index), next, ...servers.slice(index + 1)];
}

export function totals(unread: ChannelUnreadDto[]): UnreadTotals {
  return unread.reduce<UnreadTotals>(
    (acc, row) => ({
      unreadTotal: acc.unreadTotal + row.unreadCount,
      mentionTotal: acc.mentionTotal + row.mentionCount,
    }),
    { unreadTotal: 0, mentionTotal: 0 },
  );
}

export function firstUnreadId(
  unread: ChannelUnreadDto[] | undefined,
  channelId: string,
  messageIds: string[],
): string | null {
  const cursor = unread?.find((row) => row.channelId === channelId)?.lastReadMessageId;
  if (!cursor) return null;
  return messageIds.find((id) => id > cursor) ?? null;
}

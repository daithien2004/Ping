import type { ChannelUnreadDto } from '@ping/shared';
import type { ChannelScope } from '../../channel-scope';

/**
 * Mốc đã đọc của kênh đang xem. `undefined` = chưa biết (dữ liệu chưa về), `null` = chưa đọc lần nào.
 * DM mang sẵn mốc trong scope; kênh server lấy từ danh sách unread của server đó.
 */
export function unreadCursorOf(
  scope: ChannelScope,
  unread: Pick<ChannelUnreadDto, 'channelId' | 'lastReadMessageId'>[] | undefined,
  channelId: string,
): string | null | undefined {
  if (scope.kind === 'dm') return scope.lastReadMessageId;
  return unread && (unread.find((row) => row.channelId === channelId)?.lastReadMessageId ?? null);
}

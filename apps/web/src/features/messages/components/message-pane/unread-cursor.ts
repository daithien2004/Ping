import type { ChannelUnreadDto } from '@ping/shared';
import type { ChannelScope } from '../../channel-scope';

export function unreadCursorOf(
  scope: ChannelScope,
  unread: Pick<ChannelUnreadDto, 'channelId' | 'lastReadMessageId'>[] | undefined,
  channelId: string,
): string | null | undefined {
  if (scope.kind === 'dm') return scope.lastReadMessageId;
  return unread && (unread.find((row) => row.channelId === channelId)?.lastReadMessageId ?? null);
}

'use client';

import { useEffect, useState } from 'react';
import { useUnread } from '@/features/unread/hooks';
import { serverIdOf, type ChannelScope } from '../../channel-scope';
import type { ClientMessage } from '../../message-cache';
import { unreadCursorOf } from './unread-cursor';

/**
 * Nhận channel và danh sách tin nhắn cùng mốc đã đọc của server/DM.
 * Trả ID tin chưa đọc đầu tiên để giao diện đặt vạch phân cách; trả `null` nếu không có.
 * Ví dụ: đã đọc tới m5, danh sách có m5, m6, m7 → trả `'m6'` để đặt vạch trước m6.
 */
export function useUnreadDivider({
  scope,
  channelId,
  messages,
}: {
  scope: ChannelScope;
  channelId: string;
  messages: ClientMessage[];
}): string | null {
  const { data: unread } = useUnread(serverIdOf(scope));
  const [captured, setCaptured] = useState<{ channelId: string; cursor: string | null } | null>(
    null,
  );

  const available = unreadCursorOf(scope, unread, channelId);
  if (available !== undefined && captured?.channelId !== channelId) {
    setCaptured({ channelId, cursor: available });
  }
  useEffect(() => () => setCaptured(null), [channelId]);

  const cursor = captured?.channelId === channelId ? captured.cursor : null;
  return cursor != null ? (messages.find((message) => message.id > cursor)?.id ?? null) : null;
}

'use client';

import { useEffect, useState } from 'react';
import { useUnread } from '@/features/unread/hooks';
import type { ClientMessage } from '../../message-cache';

/**
 * Nhận channel và danh sách tin nhắn cùng mốc đã đọc của server/DM.
 * Trả ID tin chưa đọc đầu tiên để giao diện đặt vạch phân cách; trả `null` nếu không có.
 * Ví dụ: đã đọc tới m5, danh sách có m5, m6, m7 → trả `'m6'` để đặt vạch trước m6.
 */
export function useUnreadDivider({
  serverId,
  channelId,
  messages,
  dm,
}: {
  serverId: string | null;
  channelId: string;
  messages: ClientMessage[];
  dm?: { lastReadMessageId: string | null };
}): string | null {
  const { data: unread } = useUnread(serverId);
  const [captured, setCaptured] = useState<{ channelId: string; cursor: string | null } | null>(
    null,
  );

  const available =
    serverId === null
      ? dm?.lastReadMessageId
      : unread && (unread.find((row) => row.channelId === channelId)?.lastReadMessageId ?? null);
  if (available !== undefined && captured?.channelId !== channelId) {
    setCaptured({ channelId, cursor: available });
  }
  useEffect(() => () => setCaptured(null), [channelId]);

  const cursor = captured?.channelId === channelId ? captured.cursor : null;
  return cursor != null ? (messages.find((message) => message.id > cursor)?.id ?? null) : null;
}

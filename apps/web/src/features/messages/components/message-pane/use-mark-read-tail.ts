'use client';

import { useEffect, useRef, useState } from 'react';
import { useMarkRead } from '@/features/unread/hooks';
import { isTempId } from '../../message-cache';

/**
 * Nhận channel, ID tin cuối đang hiển thị và cờ còn tin mới hơn hay không.
 * Không trả dữ liệu; khi đang ở cuối lịch sử, tự báo server đã đọc tới tin `tailId`.
 * Ví dụ: `tailId = 'm20'`, `hasNewer = false` → đánh dấu channel đã đọc tới m20.
 */
export function useMarkReadTail({
  channelId,
  tailId,
  hasNewer,
}: {
  channelId: string;
  tailId: string | null;
  hasNewer: boolean;
}) {
  const { mutate: mutateRead } = useMarkRead(channelId);
  const lastMarked = useRef<string | null>(null);
  const retriedMarked = useRef<string | null>(null);
  const [readRetry, setReadRetry] = useState(0);
  useEffect(() => {
    if (hasNewer || !tailId || isTempId(tailId)) return;
    const marked = `${channelId}:${tailId}`;
    if (lastMarked.current === marked) return;
    lastMarked.current = marked;
    mutateRead(tailId, {
      onError: () => {
        if (lastMarked.current !== marked) return;
        lastMarked.current = null;
        if (retriedMarked.current === marked) return;
        retriedMarked.current = marked;
        setReadRetry((tick) => tick + 1);
      },
    });
  }, [tailId, hasNewer, mutateRead, channelId, readRetry]);
}

'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage } from '../../message-cache';
import { HEADER_HEIGHT } from './message-list-parts';

/**
 * Quản lý vùng cuộn danh sách tin nhắn: cuộn tới tin cần xem, tải tin cũ khi cuộn lên đầu,
 * và cuộn xuống cuối sau khi người dùng gửi tin mới.
 * Ví dụ: truyền `focusIndex = 5` thì cuộn để tin thứ 6 nằm giữa màn hình;
 * hook trả `{ scrollRef, virtualizer, scrollToEndOnNextAppend }`: hai giá trị đầu để gắn vào vùng cuộn
 * và hiển thị danh sách ảo hóa; hàm thứ ba báo "lần thêm tin kế tiếp thì cuộn xuống cuối".
 */
export function useMessageScroll({
  messages,
  focusId,
  focusIndex,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  messages: ClientMessage[];
  focusId: string | null;
  focusIndex: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const scrollOnAppend = useRef(false);
  const scrollToEndOnNextAppend = useCallback(() => {
    scrollOnAppend.current = true;
  }, []);
  const [loadOlderEnabled, setLoadOlderEnabled] = useState(false);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 4,
    paddingStart: HEADER_HEIGHT,
    getItemKey: (index) => messages[index]?.nonce ?? messages[index]?.id ?? index,
    anchorTo: 'end',
    followOnAppend: true,
  });

  useEffect(() => {
    if (didInitialScroll.current || messages.length === 0) return;
    const frame = requestAnimationFrame(() => {
      didInitialScroll.current = true;
      if (!focusId) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        requestAnimationFrame(() => setLoadOlderEnabled(true));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, virtualizer, focusId]);

  useEffect(() => {
    if (focusIndex < 0) return;
    virtualizer.scrollToIndex(focusIndex, { align: 'center' });
    setLoadOlderEnabled(true);
  }, [focusIndex, virtualizer]);

  const firstVisible = virtualizer.getVirtualItems()[0]?.index;
  useEffect(() => {
    if (
      loadOlderEnabled &&
      firstVisible !== undefined &&
      firstVisible <= 2 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage();
    }
  }, [loadOlderEnabled, firstVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!scrollOnAppend.current) return;
    scrollOnAppend.current = false;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

  return { scrollRef, virtualizer, scrollToEndOnNextAppend };
}

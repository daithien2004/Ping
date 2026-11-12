'use client';

import { CancelledError } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage } from '../../message-cache';
import { HEADER_HEIGHT } from './message-list-parts';

/**
 * Quản lý vùng cuộn danh sách tin nhắn: cuộn tới tin cần xem, tải tin cũ khi cuộn lên đầu,
 * và cuộn xuống cuối sau khi người dùng gửi tin mới.
 * Ví dụ: truyền `focusIndex = 5` thì cuộn để tin thứ 6 nằm giữa màn hình;
 * hook trả `{ scrollRef, virtualizer, scrollToEndOnNextAppend, atEnd, scrollToEnd }`: hai giá trị
 * đầu để gắn vào vùng cuộn và hiển thị danh sách ảo hóa; hàm thứ ba báo "lần thêm tin kế tiếp
 * thì cuộn xuống cuối"; `atEnd` cho biết đang ở đáy để hiện nút "Tin mới", `scrollToEnd` cuộn
 * xuống đó.
 */

/**
 * Mốc cuộn theo channel, sống ngoài component: rời kênh rồi quay lại là đúng vị trí cũ
 * (như Discord giữ chỗ đọc của từng kênh), trừ khi mở permalink — khi đó tin đích mới là mốc.
 */
const anchors = new Map<string, { id: string; atBottom: boolean }>();

export function useMessageScroll({
  channelId,
  messages,
  pageCount,
  focusId,
  focusIndex,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  channelId: string;
  messages: ClientMessage[];
  /** Số trang đã tải; dùng để phát hiện lần tải bị hủy mà không thêm trang nào. */
  pageCount: number;
  focusId: string | null;
  focusIndex: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<{
    hasNextPage: boolean;
    data: { pages: readonly unknown[] } | undefined;
  }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const scrollOnAppend = useRef(false);
  /** Tăng sau mỗi lần tải tin cũ bị hủy để effect thử lại dù các giá trị phụ thuộc không đổi. */
  const [loadOlderRetry, setLoadOlderRetry] = useState(0);
  const scrollToEndOnNextAppend = useCallback(() => {
    scrollOnAppend.current = true;
  }, []);
  const [loadOlderEnabled, setLoadOlderEnabled] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

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

  const scrollToEnd = useCallback(() => {
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    setAtEnd(true);
  }, [messages.length, virtualizer]);

  useEffect(() => {
    if (didInitialScroll.current || messages.length === 0) return;
    const frame = requestAnimationFrame(() => {
      didInitialScroll.current = true;
      // Permalink: tin đích là mốc, không khôi phục chỗ đọc cũ.
      const saved = focusId ? undefined : anchors.get(channelId);
      const savedIndex = saved ? messages.findIndex((message) => message.id === saved.id) : -1;
      if (saved && !saved.atBottom && savedIndex >= 0) {
        // Khôi phục chỗ đọc: tin neo đứng ở đầu vùng nhìn như lúc rời đi.
        virtualizer.scrollToIndex(savedIndex, { align: 'start' });
        setAtEnd(false);
        requestAnimationFrame(() => setLoadOlderEnabled(true));
        return;
      }
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      requestAnimationFrame(() => setLoadOlderEnabled(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [channelId, messages, virtualizer, focusId]);

  useEffect(() => {
    if (focusIndex < 0) return;
    virtualizer.scrollToIndex(focusIndex, { align: 'center' });
    setLoadOlderEnabled(true);
  }, [focusIndex, virtualizer]);

  // Theo dõi cuộn để lưu mốc (tin đầu vùng nhìn + có đang ở đáy không). Gộp mỗi frame:
  // sự kiện scroll bắn liên tục khi lăn chuột, không cần xử lý từng cái.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const first = virtualizer.getVirtualItems()[0];
        const id = first ? messages[first.index]?.id : undefined;
        if (!id) return;
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 24;
        anchors.set(channelId, { id, atBottom });
        setAtEnd(atBottom);
      });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [channelId, messages, virtualizer]);

  const firstVisible = virtualizer.getVirtualItems()[0]?.index;
  useEffect(() => {
    if (
      loadOlderEnabled &&
      firstVisible !== undefined &&
      firstVisible <= 2 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      // Một lần tải có thể bị hủy ngay trong cùng frame (useChannelSync hủy query lúc join room):
      // fetch không thêm trang nào, còn `isFetchingNextPage` bật rồi tắt trước khi React render.
      // Khi đó mọi giá trị của deps giữ nguyên, effect không chạy lại và danh sách kẹt ở đầu.
      // `cancelQueries` mặc định `revert: true` nên lần tải bị hủy *resolve* với dữ liệu cũ chứ
      // không reject: phải so số trang để nhận ra và đánh thức effect thử lại.
      const pagesBefore = pageCount;
      void fetchNextPage()
        .then((result) => {
          if (result.hasNextPage && (result.data?.pages.length ?? 0) <= pagesBefore) {
            setLoadOlderRetry((count) => count + 1);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof CancelledError) setLoadOlderRetry((count) => count + 1);
        });
    }
  }, [
    loadOlderEnabled,
    firstVisible,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    loadOlderRetry,
    pageCount,
  ]);

  useEffect(() => {
    if (!scrollOnAppend.current) return;
    scrollOnAppend.current = false;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

  return { scrollRef, virtualizer, scrollToEndOnNextAppend, atEnd, scrollToEnd };
}

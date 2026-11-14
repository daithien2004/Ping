'use client';

import { CancelledError } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage } from '../../message-cache';
import { HEADER_HEIGHT } from './message-list-parts';

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
      const saved = focusId ? undefined : anchors.get(channelId);
      const savedIndex = saved ? messages.findIndex((message) => message.id === saved.id) : -1;
      if (saved && !saved.atBottom && savedIndex >= 0) {
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

  const lastSettled = messages.length > 0 && !messages[messages.length - 1]?.status;
  useEffect(() => {
    if (!scrollOnAppend.current) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    if (!lastSettled) return;
    const frame = requestAnimationFrame(() => {
      scrollOnAppend.current = false;
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, lastSettled, virtualizer]);

  return { scrollRef, virtualizer, scrollToEndOnNextAppend, atEnd, scrollToEnd };
}

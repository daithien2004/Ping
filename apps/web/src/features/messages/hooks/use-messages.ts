'use client';

import {
  infiniteQueryOptions,
  useSuspenseInfiniteQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { listMessages } from '../api';
import {
  applyReactionIntents,
  preserveLocalMessages,
  type ClientMessagePage,
  type MessagesCache,
} from '../message-cache';

type MessagesKey = readonly ['channels', string, 'messages'];

export function messagesQueryOptions(channelId: string) {
  return infiniteQueryOptions<
    ClientMessagePage,
    Error,
    MessagesCache,
    MessagesKey,
    string | undefined
  >({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }): Promise<ClientMessagePage> => listMessages(channelId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.id : undefined),
    refetchOnReconnect: false,
    // Snapshot server (fetch/refetch/bù khoảng) không được xoá reaction đang chờ HTTP:
    structuralSharing: (before, after) =>
      applyReactionIntents(
        preserveLocalMessages(before as MessagesCache | undefined, after as MessagesCache),
      ),
  });
}

/**
 * Tải trước trang tin mới nhất khi người dùng chỉ hover/focus vào channel (như Discord
 * prefetch khi lia danh sách kênh): bấm vào là tin hiện ngay thay vì chờ spinner.
 */
export function prefetchMessages(queryClient: QueryClient, channelId: string) {
  return queryClient.prefetchInfiniteQuery(messagesQueryOptions(channelId));
}

export function useMessages(channelId: string) {
  return useSuspenseInfiniteQuery(messagesQueryOptions(channelId));
}

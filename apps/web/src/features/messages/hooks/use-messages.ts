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

/**
 * Một trang tin nhắn của channel. Tách khỏi hook để `prefetchMessages` và `useMessages`
 * dùng chung đúng một định nghĩa — prefetch rồi mở channel là cache hit ngay, không fetch lại.
 */
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
    // Focus không refetch (mặc định của app, như Discord). Reconnect cũng không refetch ở đây:
    // `useChannelSync` vá tin lỡ khi join lại room, `useMessageEvents` xử lý event đến muộn.
    // Trước đây cả hai đường cùng bắn — join lại room xong lại refetch thêm một lần.
    refetchOnReconnect: false,
    // Snapshot server (fetch/refetch/bù khoảng) không được xoá reaction đang chờ HTTP:
    // `applyReactionIntents` phủ lại ý định thả/gỡ lên mọi lần ghi dữ liệu.
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

/**
 * Lấy danh sách tin nhắn theo từng trang cho channel và lưu vào cache TanStack Query.
 *
 * Ví dụ dữ liệu trả về:
 * {
 *   pages: [
 *     { messages: [{ id: 'm3' }, { id: 'm2' }], hasMore: true },
 *     { messages: [{ id: 'm1' }], hasMore: false },
 *   ],
 *   pageParams: [undefined, 'm2'],
 * }
 */
export function useMessages(channelId: string) {
  return useSuspenseInfiniteQuery(messagesQueryOptions(channelId));
}

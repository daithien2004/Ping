'use client';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { listMessages } from '../api';
import {
  preserveLocalMessages,
  type ClientMessagePage,
  type MessagesCache,
} from '../message-cache';

const inWindow = (query: { state: { data: unknown } }) =>
  Boolean((query.state.data as MessagesCache | undefined)?.window);

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
  return useSuspenseInfiniteQuery<
    ClientMessagePage,
    Error,
    MessagesCache,
    readonly ['channels', string, 'messages'],
    string | undefined
  >({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }): Promise<ClientMessagePage> => listMessages(channelId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.id : undefined),
    refetchOnWindowFocus: (query) => !inWindow(query),
    refetchOnReconnect: (query) => !inWindow(query),
    structuralSharing: (before, after) =>
      preserveLocalMessages(before as MessagesCache | undefined, after as MessagesCache),
  });
}

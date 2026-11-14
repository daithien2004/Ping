'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { listMessages, listMessagesAfter, listMessagesAround } from '../api';
import {
  isTempId,
  patchGap,
  replaceWithWindow,
  type ClientMessage,
  type MessagesCache,
} from '../message-cache';
import { refetchMessages } from './cache-ops';

/** Tạo hàm đồng bộ cache tin nhắn của channel sau khi kết nối realtime được thiết lập. */
export function useChannelSync(channelId: string) {
  const queryClient = useQueryClient();
  return async () => {
    const key = qk.messages(channelId);
    await queryClient.cancelQueries({ queryKey: key, exact: true });
    const cache = queryClient.getQueryData<MessagesCache>(key);
    if (cache?.window) return reloadWindow(queryClient, channelId, cache.window.aroundId);
    return patchFromTail(queryClient, channelId, cache?.pages[0]?.messages[0]?.id);
  };
}

export async function reloadWindow(queryClient: QueryClient, channelId: string, aroundId: string) {
  const key = qk.messages(channelId);
  try {
    const page = await listMessagesAround(channelId, aroundId);
    queryClient.setQueryData<MessagesCache>(key, (old) => replaceWithWindow(old, page, aroundId));
  } catch {
    await refetchMessages(queryClient, channelId);
  }
}

/** Bù các tin nhắn cache bỏ lỡ kể từ tin cuối; invalidate query nếu không thể vá cache an toàn. */
export async function patchFromTail(
  queryClient: QueryClient,
  channelId: string,
  tail: string | undefined,
) {
  const key = qk.messages(channelId);
  if (!tail || isTempId(tail)) {
    await refetchMessages(queryClient, channelId);
    return;
  }
  try {
    const fetched: ClientMessage[] = [];
    let cursor = tail;
    for (;;) {
      const page = await listMessagesAfter(channelId, cursor);
      fetched.push(...page.messages);
      if (!page.hasMore || page.messages.length === 0) break;
      cursor = page.messages.at(-1)!.id;
    }
    const newest = await listMessages(channelId);
    const byId = new Map(fetched.map((message) => [message.id, message]));
    for (const message of newest.messages) byId.set(message.id, message);
    const combined = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    queryClient.setQueryData<MessagesCache>(key, (old) => {
      if (!old || old.window) return old;
      return patchGap(old, tail, combined);
    });
  } catch {
    await refetchMessages(queryClient, channelId);
  }
}

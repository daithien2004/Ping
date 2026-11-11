'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { listMessagesAfter, listMessagesAround } from '../api';
import { prependNewer, replaceWithWindow, type MessagesCache } from '../message-cache';

export async function resetWindow(queryClient: QueryClient, channelId: string) {
  const key = qk.messages(channelId);
  if (!queryClient.getQueryData<MessagesCache>(key)?.window) return;
  await queryClient.resetQueries({ queryKey: key, exact: true });
}

export async function seedAround(
  queryClient: QueryClient,
  channelId: string,
  messageId: string,
): Promise<'ok' | 'missing'> {
  try {
    const page = await listMessagesAround(channelId, messageId);
    queryClient.setQueryData<MessagesCache>(qk.messages(channelId), (old) =>
      replaceWithWindow(old, page, messageId),
    );
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return 'missing';
    }
    throw error;
  }
}

export async function loadNewer(queryClient: QueryClient, channelId: string) {
  const key = qk.messages(channelId);
  const cache = queryClient.getQueryData<MessagesCache>(key);
  const newest = cache?.pages[0]?.messages[0]?.id;
  if (!cache?.window || !newest) return;
  const page = await listMessagesAfter(channelId, newest);
  queryClient.setQueryData<MessagesCache>(key, (old) => prependNewer(old, page));
}

export function useResetWindow(channelId: string) {
  const queryClient = useQueryClient();
  return () => resetWindow(queryClient, channelId);
}

export function useSeedAround(channelId: string) {
  const queryClient = useQueryClient();
  return (messageId: string) => seedAround(queryClient, channelId, messageId);
}

export function useLoadNewer(channelId: string) {
  const queryClient = useQueryClient();
  return () => loadNewer(queryClient, channelId);
}

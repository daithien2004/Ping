import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';

export type CacheChange = (old: MessagesCache | undefined) => MessagesCache | undefined;

export const isMessagesKey = (key: readonly unknown[]) =>
  key[0] === 'channels' && key[2] === 'messages';

export function refetchMessages(queryClient: QueryClient, channelId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: qk.messages(channelId), exact: true });
}

export async function writeMessages(
  queryClient: QueryClient,
  channelId: string,
  change: CacheChange,
  isActive: () => boolean = () => true,
): Promise<void> {
  const key = qk.messages(channelId);
  const fetching = queryClient.getQueryState(key)?.fetchStatus === 'fetching';
  if (fetching) await queryClient.cancelQueries({ queryKey: key, exact: true });
  if (!isActive()) return;
  queryClient.setQueryData<MessagesCache>(key, change);
  if (fetching) void refetchMessages(queryClient, channelId);
}

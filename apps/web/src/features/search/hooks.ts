'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { searchMessages } from './api';

export interface SearchFiltersInput {
  q: string;
  channelId?: string;
  authorId?: string;
  since?: string;
}

export function useSearch(serverId: string, filters: SearchFiltersInput, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [
      ...qk.search(serverId),
      filters.q,
      filters.channelId ?? '',
      filters.authorId ?? '',
      filters.since ?? '',
    ],
    queryFn: ({ pageParam }) => searchMessages(serverId, { ...filters, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.results.at(-1)?.id : undefined),
    enabled,
  });
}

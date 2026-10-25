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

/**
 * Kết quả tìm kiếm theo trang cursor (T4.6). filters nằm trong query key nên đổi filter là
 * query mới. Không suspense: dialog tự hiện trạng thái tải/rỗng/lỗi.
 */
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

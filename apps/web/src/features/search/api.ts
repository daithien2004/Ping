import type { SearchResultPage } from '@ping/shared';
import { api } from '@/lib/api-client';

/** GET /servers/:serverId/search (T4.6, ADR-0045) — FTS + trigram, cursor `before`. */
export function searchMessages(
  serverId: string,
  filters: { q: string; channelId?: string; authorId?: string; since?: string; before?: string },
) {
  const params = new URLSearchParams({ q: filters.q });
  if (filters.channelId) params.set('channelId', filters.channelId);
  if (filters.authorId) params.set('authorId', filters.authorId);
  if (filters.since) params.set('since', filters.since);
  if (filters.before) params.set('before', filters.before);
  return api.get<SearchResultPage>(`/servers/${serverId}/search?${params.toString()}`);
}

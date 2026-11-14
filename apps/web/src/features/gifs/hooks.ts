'use client';
import type { GifSearchResponse } from '@ping/shared';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { fetchTrendingGifs, searchGifs } from './api';

export const GIF_QUERY_MIN_LENGTH = 2;

export function useGifSearch(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery<GifSearchResponse>({
    queryKey: qk.gifSearch(trimmed.toLowerCase()),
    queryFn: () => searchGifs(trimmed),
    enabled: enabled && trimmed.length >= GIF_QUERY_MIN_LENGTH,
    staleTime: 60 * 1000,
  });
}

export function useGifTrending(enabled = true) {
  return useQuery<GifSearchResponse>({
    queryKey: qk.gifTrending,
    queryFn: () => fetchTrendingGifs(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

'use client';
import type { GifSearchResponse } from '@ping/shared';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { fetchTrendingGifs, searchGifs } from './api';

/** Độ dài tối thiểu của truy vấn tìm GIF: tránh dập cổng có rate limit riêng (30 req/phút/user). */
export const GIF_QUERY_MIN_LENGTH = 2;

/**
 * Tìm GIF (TG.25, ADR-0069): chỉ gọi khi truy vấn đủ dài (và nơi gọi bật). staleTime ngắn —
 * kết quả tìm kiếm theo từ khóa không cần giữ lâu, gõ lại là lấy mới.
 */
export function useGifSearch(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery<GifSearchResponse>({
    queryKey: qk.gifSearch(trimmed.toLowerCase()),
    queryFn: () => searchGifs(trimmed),
    enabled: enabled && trimmed.length >= GIF_QUERY_MIN_LENGTH,
    staleTime: 60 * 1000,
  });
}

/** GIF thịnh hành cho tab GIF khi chưa gõ gì; staleTime 5 phút như dữ liệu "đổi hiếm". */
export function useGifTrending(enabled = true) {
  return useQuery<GifSearchResponse>({
    queryKey: qk.gifTrending,
    queryFn: () => fetchTrendingGifs(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

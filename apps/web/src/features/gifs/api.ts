import { z } from 'zod';
import type { GifSearchResponse } from '@ping/shared';
import { api } from '@/lib/api-client';

/**
 * Hình dạng response của cổng `/gifs/*` (TG.25): parse bằng zod ở lớp client (hướng dẫn 12.2) —
 * provider chỉ có thể là 'tenor' ở v0.2.0.
 */
const gifSearchResponseSchema = z.object({
  gifs: z.array(
    z.object({
      id: z.string().min(1),
      url: z.string().url(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      provider: z.literal('tenor'),
    }),
  ),
});

/** GET /gifs/search?q= — tìm GIF qua cổng backend (JWT; client KHÔNG gọi nhà cung cấp trực tiếp). */
export function searchGifs(query: string): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>(
    `/gifs/search?q=${encodeURIComponent(query)}`,
    gifSearchResponseSchema,
  );
}

/** GET /gifs/trending — GIF thịnh hành cho tab GIF khi chưa gõ gì. */
export function fetchTrendingGifs(limit = 30): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>(`/gifs/trending?limit=${limit}`, gifSearchResponseSchema);
}

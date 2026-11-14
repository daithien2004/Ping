import { z } from 'zod';
import type { GifSearchResponse } from '@ping/shared';
import { api } from '@/lib/api-client';

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

export function searchGifs(query: string): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>(
    `/gifs/search?q=${encodeURIComponent(query)}`,
    gifSearchResponseSchema,
  );
}

export function fetchTrendingGifs(limit = 30): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>(`/gifs/trending?limit=${limit}`, gifSearchResponseSchema);
}

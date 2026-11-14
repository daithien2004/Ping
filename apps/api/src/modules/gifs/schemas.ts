import { z } from 'zod';

export const gifSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type GifSearchQuery = z.infer<typeof gifSearchQuerySchema>;

export const gifTrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type GifTrendingQuery = z.infer<typeof gifTrendingQuerySchema>;

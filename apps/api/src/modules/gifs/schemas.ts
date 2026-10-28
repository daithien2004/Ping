import { z } from 'zod';

/**
 * Tham số query của cổng GIF (TG.25, ADR-0069). `limit` mặc định 24 — vừa khít khối grid
 * picker; sai hình thức trả 400 VALIDATION_ERROR chung. `contentfilter` không nằm ở đây:
 * `high` ghim cứng trong TenorProvider, không bao giờ nhận từ client.
 */
export const gifSearchQuerySchema = z.object({
  // Bắt buộc 1..64 ký tự SAU trim: chuỗi trắng hoặc quá dài bị chặn ở schema.
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type GifSearchQuery = z.infer<typeof gifSearchQuerySchema>;

export const gifTrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type GifTrendingQuery = z.infer<typeof gifTrendingQuerySchema>;

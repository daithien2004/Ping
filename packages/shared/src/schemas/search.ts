import { z } from 'zod';

/** Truy vấn rỗng (sau trim) hoặc dài hơn `Limits.SEARCH_QUERY_MAX` → 400 SEARCH_QUERY_INVALID. */
export const searchQuerySchema = z.object({
  // `q` kiểm ở service để trả đúng mã SEARCH_QUERY_INVALID (không phải VALIDATION_ERROR).
  q: z.string().optional(),
  channelId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  since: z.coerce.date().optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  // `hybrid`: gộp FTS (khớp từ) với tìm theo nghĩa bằng vector qua RRF (ADR-0103). Không phân trang: bỏ qua `before`.
  mode: z.enum(['keyword', 'hybrid']).default('keyword'),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResultItem {
  id: string;
  content: string;
  channelId: string;
  channelName: string;
  createdAt: string;
  authorId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

export interface SearchResultPage {
  results: SearchResultItem[];
  hasMore: boolean;
}

import { z } from 'zod';

/**
 * GET /servers/:serverId/search (T4.6, ADR-0045). FTS `simple` + unaccent, OR con-chuỗi
 * trigram; lọc theo channel/người gửi/thời điểm; phân trang cursor `before` (mới nhất trước).
 * Truy vấn rỗng (sau trim) hoặc dài hơn `Limits.SEARCH_QUERY_MAX` → 400 SEARCH_QUERY_INVALID.
 */
export const searchQuerySchema = z.object({
  // `q` kiểm ở service để trả đúng mã SEARCH_QUERY_INVALID (không phải VALIDATION_ERROR chung).
  q: z.string().optional(),
  channelId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  /** ISO 8601 — chỉ trả tin từ thời điểm này trở đi (filter thời gian của UI). */
  since: z.coerce.date().optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Một kết quả tìm kiếm: tin kèm kênh + tác giả để UI hiển thị và nhảy tới. */
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

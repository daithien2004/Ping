import type { GifDto } from '@ping/shared';

/**
 * Cổng gọi nhà cung cấp GIF (TG.25, ADR-0069): backend là cổng DUY NHẤT giữ key và gọi mạng —
 * client không bao giờ chạm nhà cung cấp trực tiếp. Adapter dự phòng (bộ GIF/WebP tự host,
 * nếu Tenor không dùng được) chỉ là một lớp implement mới trên interface này.
 */
export interface GifProvider {
  /** Tìm GIF theo từ khóa; `query` đã qua validate (1..64 ký tự sau trim) ở tầng API. */
  search(query: string, limit: number): Promise<GifDto[]>;
  /** Trending cho tab mặc định của picker. */
  trending(limit: number): Promise<GifDto[]>;
}

/**
 * Nhà cung cấp chưa cấu hình key, lỗi mạng hoặc hết quota — tầng service quy về 503
 * `GIF_PROVIDER_UNAVAILABLE` để picker hiện empty state, chat không ảnh hưởng.
 */
export class GifProviderUnavailableError extends Error {
  constructor(message = 'Nhà cung cấp GIF không dùng được') {
    super(message);
    this.name = 'GifProviderUnavailableError';
  }
}

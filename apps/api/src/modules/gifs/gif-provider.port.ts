import type { GifDto } from '@ping/shared';

// Backend là cổng duy nhất giữ key và gọi nhà cung cấp; client không chạm trực tiếp.
export interface GifProvider {
  search(query: string, limit: number): Promise<GifDto[]>;
  trending(limit: number): Promise<GifDto[]>;
}

// Chưa có key, lỗi mạng hoặc hết quota; service quy về 503 GIF_PROVIDER_UNAVAILABLE.
export class GifProviderUnavailableError extends Error {
  constructor(message = 'Nhà cung cấp GIF không dùng được') {
    super(message);
    this.name = 'GifProviderUnavailableError';
  }
}

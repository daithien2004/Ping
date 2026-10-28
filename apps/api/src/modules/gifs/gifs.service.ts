import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCodes, type GifDto, type GifSearchResponse } from '@ping/shared';
import { GifCache } from './gif-cache.js';
import { GifProviderUnavailableError, type GifProvider } from './gif-provider.port.js';
import { GIF_PROVIDER } from './gif.tokens.js';
import { GifRateLimiter } from './gif-rate-limiter.js';

/**
 * Cổng GIF phía service (TG.25, ADR-0069): rate limit theo user → cache in-memory 5 phút →
 * nhà cung cấp (chỉ khi cache miss). Thiếu key, Tenor lỗi hoặc hết quota đều suy giảm thành
 * 503 `GIF_PROVIDER_UNAVAILABLE` — picker hiện empty state, chat không ảnh hưởng.
 */
@Injectable()
export class GifsService {
  constructor(
    @Inject(GIF_PROVIDER) private readonly provider: GifProvider,
    private readonly cache: GifCache,
    private readonly rateLimiter: GifRateLimiter,
  ) {}

  async search(userId: string, query: string, limit: number): Promise<GifSearchResponse> {
    await this.rateLimiter.consume(userId);
    return {
      gifs: await this.remember(`search:${query}:${limit}`, () =>
        this.provider.search(query, limit),
      ),
    };
  }

  async trending(userId: string, limit: number): Promise<GifSearchResponse> {
    await this.rateLimiter.consume(userId);
    return { gifs: await this.remember(`trending:${limit}`, () => this.provider.trending(limit)) };
  }

  /** Cache-first: hit trả ngay không đụng nhà cung cấp; miss gọi rồi lưu (lỗi không cache). */
  private async remember(key: string, load: () => Promise<GifDto[]>): Promise<GifDto[]> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const gifs = await load();
      this.cache.set(key, gifs);
      return gifs;
    } catch (error) {
      if (error instanceof GifProviderUnavailableError) {
        throw new ServiceUnavailableException({
          code: ErrorCodes.GIF_PROVIDER_UNAVAILABLE,
          message: 'GIF provider unavailable',
        });
      }
      throw error;
    }
  }
}

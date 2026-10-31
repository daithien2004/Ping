import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

/** Tối đa 30 lần tìm kiếm trong 1 phút cho mỗi user (T6.5). */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Giới hạn tìm kiếm theo user (T6.5): truy vấn FTS + trigram quét toàn server nên một user có
 * thể chiếm DB; throttler toàn cục 100 req/phút/IP không đủ và chạy trước JwtAuthGuard nên
 * không biết userId. Cùng pattern MessageRateLimiter/GifRateLimiter — Redis chết thì fail-open
 * (ADR-0026), thà mất giới hạn còn hơn chặn tìm kiếm.
 */
@Injectable()
export class SearchRateLimiter {
  private readonly logger = new Logger(SearchRateLimiter.name);
  private readonly storage: RedisThrottlerStorage;

  constructor(private readonly redis: RedisProvider) {
    this.storage = new RedisThrottlerStorage(redis);
  }

  async consume(userId: string): Promise<void> {
    const result = await failOpen(
      this.redis,
      this.logger,
      'search-rate',
      () => this.storage.increment(`search:${userId}`, WINDOW_MS, LIMIT, WINDOW_MS, 'search'),
      undefined,
    );
    if (result?.isBlocked) {
      throw new TooManyRequestsError(result.timeToBlockExpire, 'You are searching too fast');
    }
  }
}

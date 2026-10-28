import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

/** Tối đa 30 lần tìm trong 1 phút cho mỗi user (TG.25, ADR-0069). */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Giới hạn cổng GIF theo user (ADR-0069): mỗi lời gọi tốn hạn mức Tenor của server nên cần
 * trần riêng, chặt hơn throttler toàn cục 100 req/phút/IP (chạy trước JwtAuthGuard nên không
 * biết userId). Tái dùng đúng pattern MessageRateLimiter: RedisThrottlerStorage + fail-open —
 * Redis chết thì cho qua (quy tắc 17), thà mất giới hạn còn hơn chặn picker.
 */
@Injectable()
export class GifRateLimiter {
  private readonly logger = new Logger(GifRateLimiter.name);
  private readonly storage: RedisThrottlerStorage;

  constructor(private readonly redis: RedisProvider) {
    this.storage = new RedisThrottlerStorage(redis);
  }

  async consume(userId: string): Promise<void> {
    const result = await failOpen(
      this.redis,
      this.logger,
      'gif-rate',
      () => this.storage.increment(`gif:${userId}`, WINDOW_MS, LIMIT, WINDOW_MS, 'gif'),
      undefined,
    );
    if (result?.isBlocked) {
      throw new TooManyRequestsError(result.timeToBlockExpire, 'You are searching GIFs too fast');
    }
  }
}

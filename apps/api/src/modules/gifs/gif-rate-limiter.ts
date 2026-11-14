import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

const LIMIT = 30;
const WINDOW_MS = 60_000;

// Fail-open khi Redis chết: thà mất giới hạn còn hơn chặn picker.
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

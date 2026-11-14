import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

const LIMIT = 30;
const WINDOW_MS = 60_000;

// Truy vấn FTS + trigram quét toàn server nên giới hạn theo user; Redis chết → fail-open.
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

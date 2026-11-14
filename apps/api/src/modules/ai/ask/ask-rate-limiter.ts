import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../../common/too-many-requests.error.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';
import { failOpen } from '../../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../../infra/throttler/redis-throttler.storage.js';

const LIMIT = 10;
const WINDOW_MS = 60_000;

// Throttler toàn cục chạy trước JwtAuthGuard nên không biết userId; Redis chết thì fail-open.
@Injectable()
export class AskRateLimiter {
  private readonly logger = new Logger(AskRateLimiter.name);
  private readonly storage: RedisThrottlerStorage;

  constructor(private readonly redis: RedisProvider) {
    this.storage = new RedisThrottlerStorage(redis);
  }

  async consume(userId: string): Promise<void> {
    const result = await failOpen(
      this.redis,
      this.logger,
      'ask-rate',
      () => this.storage.increment(`ask:${userId}`, WINDOW_MS, LIMIT, WINDOW_MS, 'ask'),
      undefined,
    );
    if (result?.isBlocked) {
      throw new TooManyRequestsError(result.timeToBlockExpire, 'You are asking too fast');
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

const LIMIT = 30;
const WINDOW_MS = 10_000;

// Throttler toàn cục chạy trước JwtAuthGuard nên chỉ biết IP; Redis chết → fail-open.
@Injectable()
export class ReactionRateLimiter {
  private readonly logger = new Logger(ReactionRateLimiter.name);
  private readonly storage: RedisThrottlerStorage;

  constructor(private readonly redis: RedisProvider) {
    this.storage = new RedisThrottlerStorage(redis);
  }

  async consume(userId: string, channelId: string): Promise<void> {
    const result = await failOpen(
      this.redis,
      this.logger,
      'reaction-rate',
      () =>
        this.storage.increment(
          `reaction:${userId}:${channelId}`,
          WINDOW_MS,
          LIMIT,
          WINDOW_MS,
          'reaction',
        ),
      undefined,
    );
    if (result?.isBlocked) {
      throw new TooManyRequestsError(result.timeToBlockExpire, 'You are reacting too fast');
    }
  }
}

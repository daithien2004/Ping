import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

const LIMIT = 10;
const WINDOW_MS = 10_000;

// Đặt trong service vì throttler toàn cục chạy TRƯỚC JwtAuthGuard nên không biết userId; Redis chết → fail-open.
@Injectable()
export class MessageRateLimiter {
  private readonly logger = new Logger(MessageRateLimiter.name);
  private readonly storage: RedisThrottlerStorage;

  constructor(private readonly redis: RedisProvider) {
    this.storage = new RedisThrottlerStorage(redis);
  }

  async consume(userId: string, channelId: string): Promise<void> {
    const result = await failOpen(
      this.redis,
      this.logger,
      'message-rate',
      () =>
        this.storage.increment(
          `message:${userId}:${channelId}`,
          WINDOW_MS,
          LIMIT,
          WINDOW_MS,
          'message',
        ),
      undefined,
    );
    if (result?.isBlocked) {
      throw new TooManyRequestsError(result.timeToBlockExpire, 'You are sending messages too fast');
    }
  }
}

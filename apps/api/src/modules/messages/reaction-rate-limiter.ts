import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

/** Tối đa 30 thao tác cảm xúc trong 10 giây cho mỗi (user, channel) — TG.2. */
const LIMIT = 30;
const WINDOW_MS = 10_000;

/**
 * Chống spam thả/gỡ cảm xúc (TG.2, ADR-0064). Cùng lý do với `MessageRateLimiter`: throttler
 * toàn cục chạy trước JwtAuthGuard nên chỉ biết IP; giới hạn theo user + channel đặt ở service.
 * Redis chết → cho qua (fail-open, quy tắc 17).
 */
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

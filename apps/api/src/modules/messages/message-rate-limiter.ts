import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../infra/throttler/redis-throttler.storage.js';

/** Tối đa 10 tin trong 10 giây cho mỗi (user, channel); vượt thì bị chặn nốt phần cửa sổ còn lại. */
const LIMIT = 10;
const WINDOW_MS = 10_000;

/**
 * Chống flood tin nhắn theo user + channel (ADR-0027). Giới hạn chung 100 request/phút/IP của
 * throttler toàn cục không đủ: một user có thể chiếm cả channel trong vài giây. Đặt trong service
 * (sau guard xác thực) vì throttler toàn cục chạy TRƯỚC JwtAuthGuard nên không biết userId.
 * Redis chết → cho qua (fail-open, quy tắc 17): thà mất giới hạn còn hơn chặn nhắn tin.
 */
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

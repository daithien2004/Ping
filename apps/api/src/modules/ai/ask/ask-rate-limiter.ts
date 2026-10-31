import { Injectable, Logger } from '@nestjs/common';
import { TooManyRequestsError } from '../../../common/too-many-requests.error.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';
import { failOpen } from '../../../infra/redis/redis-policy.js';
import { RedisThrottlerStorage } from '../../../infra/throttler/redis-throttler.storage.js';

/** Tối đa 10 câu hỏi AI trong 1 phút cho mỗi user (T6.5). */
const LIMIT = 10;
const WINDOW_MS = 60_000;

/**
 * Giới hạn cổng hỏi AI theo user (T6.5): mỗi lời gọi tốn embedding + lượt LLM + hạn mức ngày,
 * nên cần trần riêng chặt hơn throttler toàn cục 100 req/phút/IP (chạy trước JwtAuthGuard nên
 * không biết userId). Tái dùng pattern MessageRateLimiter: RedisThrottlerStorage + fail-open —
 * Redis chết thì cho qua (ADR-0026), quota ngày và budget vẫn do AiUsageService giữ.
 */
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

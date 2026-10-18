import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisProvider } from '../redis/redis.module.js';

/**
 * `ThrottlerStorageRecord` exists in the package but is not re-exported from
 * its barrel, so derive it from the interface itself — stays in sync for free.
 */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Fixed-window counter trên Redis.
 *
 * Vào:  ttl / blockDuration là MILLISECONDS (guard dịch từ cấu hình module).
 * Ra:   timeToExpire / timeToBlockExpire là SECONDS — guard gán thẳng vào
 *       header X-RateLimit-Reset và Retry-After (chuẩn HTTP dùng giây).
 *
 * Lưu ý atomicity: INCR rồi mới PEXPIRE không phải transaction — hai lời gọi
 * cùng lúc có thể đua nhau. Vết race ở đây vô hại (cùng lắm window lệch vài ms);
 * hardening thật sự bằng Lua script là bài nâng cao sau.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisProvider) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:block`;

    const [totalHits, counterTtl, blockTtl] = await Promise.all([
      this.redis.incr(hitsKey),
      this.redis.pttl(hitsKey), // ms; -1 = key chưa có expiry
      this.redis.pttl(blockKey),
    ]);

    // Lần đầu của window (hoặc counter mất ttl do crash giữa chừng) → mở window.
    if (counterTtl < 0) {
      await this.redis.pexpire(hitsKey, ttl);
    }

    const timeToExpire = counterTtl > 0 ? Math.ceil(counterTtl / 1000) : Math.ceil(ttl / 1000);

    if (blockTtl > 0) {
      // Vẫn trong vùng block của lần vượt limit trước.
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtl / 1000),
      };
    }

    if (totalHits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}

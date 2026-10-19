import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisProvider } from '../redis/redis.module.js';

/**
 * `ThrottlerStorageRecord` exists in the package but is not re-exported from
 * its barrel, so derive it from the interface itself — stays in sync for free.
 */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Một lần gọi, chạy nguyên tử trên Redis: tăng bộ đếm, mở window nếu là hit đầu,
 * bật cờ block khi vượt limit. Trả về [số hit, ms còn lại của window, ms còn lại của block (≤ 0 = không block)].
 * KEYS[1] = bộ đếm, KEYS[2] = cờ block; ARGV = ttl ms, limit, blockDuration ms.
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return { hits, ttl, blockTtl }
`;

/**
 * Fixed-window counter trên Redis.
 *
 * Vào:  ttl / blockDuration là MILLISECONDS (guard dịch từ cấu hình module).
 * Ra:   timeToExpire / timeToBlockExpire là SECONDS — guard gán thẳng vào
 *       header X-RateLimit-Reset và Retry-After (chuẩn HTTP dùng giây).
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
    const [totalHits, counterTtl, blockTtl] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      hitsKey,
      `${hitsKey}:block`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number];

    const isBlocked = blockTtl > 0;
    return {
      totalHits,
      timeToExpire: Math.ceil(counterTtl / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockTtl / 1000) : 0,
    };
  }
}

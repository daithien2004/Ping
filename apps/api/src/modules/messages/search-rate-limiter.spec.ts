import { describe, expect, it, vi } from 'vitest';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import type { RedisProvider } from '../../infra/redis/redis.module.js';
import { SearchRateLimiter } from './search-rate-limiter.js';

function redisStub(up: boolean, results: Array<[number, number, number]>) {
  let call = 0;
  const evaluate = vi.fn(
    async () => results[Math.min(call++, results.length - 1)] as [number, number, number],
  );
  return { redis: { isUp: up, eval: evaluate } as unknown as RedisProvider, evaluate };
}

describe('SearchRateLimiter (T6.5)', () => {
  it('cho qua trong hạn mức rồi 429 kèm thời gian chờ khi vượt', async () => {
    const { redis, evaluate } = redisStub(true, [
      [30, 60_000, 0],
      [31, 60_000, 15_000],
    ]);
    const limiter = new SearchRateLimiter(redis);

    await expect(limiter.consume('user-1')).resolves.toBeUndefined();
    await expect(limiter.consume('user-1')).rejects.toBeInstanceOf(TooManyRequestsError);

    expect(evaluate).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      2,
      'throttle:search:search:user-1',
      'throttle:search:search:user-1:block',
      60_000,
      30,
      60_000,
    );
  });

  it('fail-open khi Redis chết: không chặn, không gọi Redis', async () => {
    const { redis, evaluate } = redisStub(false, []);
    await expect(new SearchRateLimiter(redis).consume('user-1')).resolves.toBeUndefined();
    expect(evaluate).not.toHaveBeenCalled();
  });
});

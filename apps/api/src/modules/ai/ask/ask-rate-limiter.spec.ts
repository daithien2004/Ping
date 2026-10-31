import { ErrorCodes } from '@ping/shared';
import { describe, expect, it, vi } from 'vitest';
import { TooManyRequestsError } from '../../../common/too-many-requests.error.js';
import type { RedisProvider } from '../../../infra/redis/redis.module.js';
import { AskRateLimiter } from './ask-rate-limiter.js';

function redisStub(up: boolean, results: Array<[number, number, number]>) {
  let call = 0;
  const evaluate = vi.fn(
    async () => results[Math.min(call++, results.length - 1)] as [number, number, number],
  );
  return { redis: { isUp: up, eval: evaluate } as unknown as RedisProvider, evaluate };
}

describe('AskRateLimiter (T6.5)', () => {
  it('cho qua trong hạn mức rồi 429 kèm thời gian chờ khi vượt', async () => {
    const { redis, evaluate } = redisStub(true, [
      [10, 60_000, 0],
      [11, 60_000, 42_000],
    ]);
    const limiter = new AskRateLimiter(redis);

    await expect(limiter.consume('user-1')).resolves.toBeUndefined();
    await expect(limiter.consume('user-1')).rejects.toMatchObject({ retryAfterSeconds: 42 });

    // Fixed window 1 phút/user, tên throttle riêng để không đụng bộ đếm khác.
    expect(evaluate).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      2,
      'throttle:ask:ask:user-1',
      'throttle:ask:ask:user-1:block',
      60_000,
      10,
      60_000,
    );
  });

  it('phát đúng mã TOO_MANY_REQUESTS để web dịch câu lỗi', async () => {
    const { redis } = redisStub(true, [[11, 60_000, 60_000]]);
    const error = await new AskRateLimiter(redis)
      .consume('user-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).getResponse()).toMatchObject({
      code: ErrorCodes.TOO_MANY_REQUESTS,
    });
  });

  it('fail-open khi Redis chết: không chặn, không gọi Redis', async () => {
    const { redis, evaluate } = redisStub(false, []);
    await expect(new AskRateLimiter(redis).consume('user-1')).resolves.toBeUndefined();
    expect(evaluate).not.toHaveBeenCalled();
  });
});

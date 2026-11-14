import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable } from '../../infra/redis/redis-policy.js';

// Đếm riêng theo IP và theo email (băm) kể cả khi email không tồn tại. Redis chết → 503 (fail-closed):
// đây là cửa phát thư, mở khóa khi hạ tầng hỏng là email bombing.
@Injectable()
export class AccountRateLimitService {
  private readonly logger = new Logger(AccountRateLimitService.name);

  constructor(private readonly redis: RedisProvider) {}

  assertForgotAllowed(email: string, ip: string): Promise<void> {
    return this.hit('pwdforgot', 10, email, ip);
  }

  assertResendAllowed(email: string, ip: string): Promise<void> {
    return this.hit('verifyresend', 5, email, ip);
  }

  private async hit(prefix: string, limit: number, email: string, ip: string): Promise<void> {
    if (!this.redis.isUp) {
      throw redisUnavailable();
    }
    const WINDOW_SECONDS = 60 * 60;
    const keys = [`acct:${prefix}:ip:${digest(ip)}`, `acct:${prefix}:email:${digest(email)}`];
    try {
      for (const key of keys) {
        // SET NX kèm TTL rồi mới INCR: không để lại khóa vĩnh viễn nếu tiến trình chết giữa hai lệnh.
        await this.redis.set(key, 0, 'EX', WINDOW_SECONDS, 'NX');
        const hits = await this.redis.incr(key);
        if (hits > limit) {
          throw new TooManyRequestsError(await this.redis.ttl(key), 'Too many requests');
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw redisUnavailable();
    }
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

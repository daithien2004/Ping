import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable, warnRedisDown } from '../../infra/redis/redis-policy.js';

const PAIR_LIMIT = 5;
const EMAIL_LIMIT = 20;
const WINDOW_SECONDS = 15 * 60;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

// Đếm theo email dù tài khoản có tồn tại hay không (không lộ email đã đăng ký); kiểm TRƯỚC argon2.verify.
// Đánh đổi: 20 lần sai từ mọi IP khóa tạm tài khoản nạn nhân. Redis chết → fail-closed.
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(private readonly redis: RedisProvider) {}

  private keys(email: string, ip: string) {
    const emailHash = digest(email);
    return {
      pair: `loginfail:pair:${emailHash}:${digest(ip)}`,
      email: `loginfail:email:${emailHash}`,
    };
  }

  async assertAllowed(email: string, ip: string): Promise<void> {
    if (!this.redis.isUp) {
      throw redisUnavailable();
    }
    const keys = this.keys(email, ip);
    try {
      const [pair, byEmail] = await Promise.all([
        this.redis.get(keys.pair),
        this.redis.get(keys.email),
      ]);
      const locked =
        Number(pair ?? 0) >= PAIR_LIMIT
          ? keys.pair
          : Number(byEmail ?? 0) >= EMAIL_LIMIT
            ? keys.email
            : null;
      if (locked) {
        throw new TooManyRequestsError(
          await this.redis.ttl(locked),
          'Too many failed sign-in attempts',
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw redisUnavailable();
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const keys = this.keys(email, ip);
    try {
      for (const key of [keys.pair, keys.email]) {
        // SET NX kèm TTL rồi mới INCR: không để lại khóa vĩnh viễn nếu tiến trình chết giữa hai lệnh.
        await this.redis.set(key, 0, 'EX', WINDOW_SECONDS, 'NX');
        await this.redis.incr(key);
      }
    } catch (error) {
      warnRedisDown(this.logger, 'login-attempts', error);
    }
  }

  async reset(email: string, ip: string): Promise<void> {
    const keys = this.keys(email, ip);
    await this.redis.del(keys.pair, keys.email).catch((error: unknown) => {
      warnRedisDown(this.logger, 'login-attempts', error);
    });
  }
}

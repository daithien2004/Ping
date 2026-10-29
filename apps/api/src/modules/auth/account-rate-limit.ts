import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable } from '../../infra/redis/redis-policy.js';

/**
 * Giới hạn tần suất gửi thư vòng đời tài khoản (TG.8): quên mật khẩu 10 lượt/giờ,
 * gửi lại thư xác minh 5 lượt/giờ — đếm RIÊNG theo IP VÀ theo email trên Redis
 * (dùng chung mọi instance) như bộ đếm đăng nhập sai. Email băm trước khi làm khóa
 * nên Redis không chứa email thô. Đếm kể cả khi email không tồn tại: không dò được
 * "email nào được ưu tiên" qua việc vượt trần.
 *
 * Redis chết → từ chối 503 (fail-closed): đây là cửa phát thư, mở khóa miễn phí khi
 * hạ tầng hỏng là email bombing (cùng chính sách fail-closed với đăng nhập).
 */
@Injectable()
export class AccountRateLimitService {
  private readonly logger = new Logger(AccountRateLimitService.name);

  constructor(private readonly redis: RedisProvider) {}

  /** Quên mật khẩu: 10 lượt/giờ theo IP và theo email. */
  assertForgotAllowed(email: string, ip: string): Promise<void> {
    return this.hit('pwdforgot', 10, email, ip);
  }

  /** Gửi lại thư xác minh: 5 lượt/giờ theo IP và theo email. */
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
        // SET NX tạo khóa kèm TTL rồi mới INCR (INCR giữ nguyên TTL): không có khoảng hở
        // để lại khóa vĩnh viễn nếu tiến trình chết giữa hai lệnh — pattern của LoginAttempts.
        await this.redis.set(key, 0, 'EX', WINDOW_SECONDS, 'NX');
        const hits = await this.redis.incr(key);
        if (hits > limit) {
          throw new TooManyRequestsError(await this.redis.ttl(key), 'Too many requests');
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error; // 429 do chính bộ đếm, không phải lỗi hạ tầng
      }
      throw redisUnavailable();
    }
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

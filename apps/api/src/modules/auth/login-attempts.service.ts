import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TooManyRequestsError } from '../../common/too-many-requests.error.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable, warnRedisDown } from '../../infra/redis/redis-policy.js';

/** 5 lần sai liên tiếp từ cùng một (email, IP) → khóa; 20 lần từ mọi IP cộng lại → khóa tài khoản. */
const PAIR_LIMIT = 5;
const EMAIL_LIMIT = 20;
/** Cửa sổ đếm VÀ thời gian khóa: tính từ lần sai đầu tiên, tối đa 15 phút. */
const WINDOW_SECONDS = 15 * 60;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Chống dò mật khẩu (ADR-0027). Bộ đếm nằm trên Redis (dùng chung mọi instance), khóa theo hash của
 * email/IP nên Redis không chứa email thô. Đếm theo email DÙ TÀI KHOẢN CÓ TỒN TẠI HAY KHÔNG: phản hồi
 * giống hệt nhau, không lộ email nào đã đăng ký. Kiểm tra TRƯỚC argon2.verify nên cũng tiết kiệm CPU.
 *
 * Đánh đổi đã biết: kẻ xấu cố tình đoán sai 20 lần có thể khóa tạm tài khoản của nạn nhân tối đa
 * 15 phút (khóa theo email); khóa theo cặp (email, IP) giữ cho người dùng thật vẫn đăng nhập được từ
 * IP của họ chừng nào IP đó chưa sai quá 5 lần. Redis chết → từ chối (fail-closed, cùng chính sách
 * với rate limit đăng nhập).
 */
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

  /** Ném 429 nếu đang bị khóa. Gọi TRƯỚC khi kiểm tra mật khẩu. */
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
        // SET NX tạo khóa kèm TTL rồi mới INCR (INCR giữ nguyên TTL): không có khoảng hở để lại
        // khóa vĩnh viễn nếu tiến trình chết giữa hai lệnh.
        await this.redis.set(key, 0, 'EX', WINDOW_SECONDS, 'NX');
        await this.redis.incr(key);
      }
    } catch (error) {
      warnRedisDown(this.logger, 'login-attempts', error); // assertAllowed đã chạy được ngay trước đó
    }
  }

  /** Đăng nhập đúng: xóa bộ đếm. */
  async reset(email: string, ip: string): Promise<void> {
    const keys = this.keys(email, ip);
    await this.redis.del(keys.pair, keys.email).catch((error: unknown) => {
      warnRedisDown(this.logger, 'login-attempts', error);
    });
  }
}

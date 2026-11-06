import { type ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable, warnRedisDown } from '../../infra/redis/redis-policy.js';
import { RATE_LIMIT_BY_IP, RATE_LIMIT_FAIL_CLOSED } from '../decorators.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * ThrottlerGuard toàn cục cũng chạy cho handler WebSocket, nhưng nó đọc ngữ cảnh
 * như HTTP: `req.ip` của socket là undefined (mọi socket chung MỘT bộ đếm) và
 * `res` là payload event (null → TypeError). Giới hạn tần suất cho socket nằm ở
 * gateway (theo từng socket); guard này chỉ lo HTTP.
 *
 * Bộ đếm nằm trên Redis. Redis chết: mặc định cho request đi tiếp (fail-open), riêng endpoint có
 * `@RateLimitFailClosed()` thì trả 503 (ADR-0026).
 *
 * Khoá đếm (ADR-0080): `@nestjs/throttler` mặc định ghép Controller-Handler với tracker, tức
 * mỗi route một cửa sổ. Guard này thêm danh tính người gọi: request có access token HỢP LỆ đếm
 * theo `user:<sub>`, còn lại đếm theo IP như cũ. Nhờ vậy hai người dùng chung một IP (văn phòng,
 * NAT) không giành hạn mức của nhau, còn request chưa xác thực (`/auth/*`, `/attachments/:id/file`,
 * token giả) vẫn khoá theo IP — không thể tạo bucket vô hạn bằng token bịa.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  private readonly policyLogger = new Logger(HttpThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly redis: RedisProvider,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  /**
   * Tracker của một request: `user:<sub>` khi access token hợp lệ, ngược lại IP đã chuẩn hoá
   * (IPv6 gộp theo /64) qua `super.getTracker`.
   *
   * SECURITY: chỉ dùng `sub` sau khi `verifyAsync` kiểm chữ ký — đọc payload mà không verify thì
   * một `sub` bịa trong token rác sẽ tạo bucket mới cho mỗi request, vô hiệu hoá rate limit.
   * Token sai/hết hạn, thiếu header hay `sub` rỗng đều rơi về IP. Không khoá theo tham số query
   * (`?user=` trên `/attachments/:id/file`) vì client tự do đặt giá trị — chính là lỗ hổng trên.
   */
  protected override async getTracker(req: Request, context?: ExecutionContext): Promise<string> {
    if (!context || !this.isIpKeyed(context)) {
      const userId = await this.verifiedUserId(req);
      if (userId) {
        return `user:${userId}`;
      }
    }
    return super.getTracker(req);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    if (!this.redis.isUp) {
      return this.redisDown(props.context);
    }
    try {
      return await super.handleRequest(props);
    } catch (error) {
      if (error instanceof HttpException) {
        if (error instanceof ThrottlerException) {
          this.setThrottledHeaders(props);
        }
        throw error; // 429 do chính rate limit, không phải lỗi hạ tầng
      }
      return this.redisDown(props.context, error);
    }
  }

  /**
   * 429 của guard chỉ có `Retry-After` (lớp cha ném ngay sau khi đặt header đó), trong khi client
   * đọc `X-RateLimit-Limit` để biết bucket nào vừa cạn (ADR-0078). Bổ sung hai header còn thiếu —
   * thuần bổ sung, không đổi tên hay ngữ nghĩa header cũ.
   */
  private setThrottledHeaders(props: ThrottlerRequest): void {
    const suffix = props.throttler.name === 'default' ? '' : `-${props.throttler.name}`;
    const res = props.context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();
    res.setHeader(`${this.headerPrefix}-Limit${suffix}`, String(props.limit));
    res.setHeader(`${this.headerPrefix}-Remaining${suffix}`, '0');
  }

  /** Bucket khai `@RateLimitByIp()` bỏ qua danh tính người dùng, luôn đếm theo IP. */
  private isIpKeyed(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(RATE_LIMIT_BY_IP, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  /** `sub` từ token đã verify, hoặc undefined khi thiếu/sai/hết hạn/token rỗng. Không bao giờ ném. */
  private async verifiedUserId(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      return undefined;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) {
      return undefined;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
    } catch {
      // Chữ ký sai, hết hạn hoặc token rác: về IP. Không log (mỗi request rác một dòng log là
      // khuếch đại log); 401 của JwtAuthGuard mới là nơi báo lỗi xác thực cho client.
      return undefined;
    }
  }

  private redisDown(context: ExecutionContext, cause?: unknown): boolean {
    const failClosed = this.reflector.getAllAndOverride<boolean | undefined>(
      RATE_LIMIT_FAIL_CLOSED,
      [context.getHandler(), context.getClass()],
    );
    if (failClosed) {
      throw redisUnavailable();
    }
    warnRedisDown(this.policyLogger, 'rate-limit', cause);
    return true;
  }
}

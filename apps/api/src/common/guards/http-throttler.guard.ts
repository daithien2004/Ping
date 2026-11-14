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

// Guard toàn cục cũng chạy cho WebSocket nhưng đọc ngữ cảnh như HTTP (req.ip undefined, res null → TypeError); rate limit socket nằm ở gateway.
// Redis chết: fail-open, trừ @RateLimitFailClosed() → 503.
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

  // SECURITY: chỉ dùng sub sau verifyAsync; đọc payload chưa verify thì token rác tạo bucket mới mỗi request.
  // Không khoá theo tham số query: client tự đặt giá trị.
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
        throw error;
      }
      return this.redisDown(props.context, error);
    }
  }

  // 429 của guard chỉ có Retry-After; bổ sung X-RateLimit-* để client biết bucket nào vừa cạn.
  private setThrottledHeaders(props: ThrottlerRequest): void {
    const suffix = props.throttler.name === 'default' ? '' : `-${props.throttler.name}`;
    const res = props.context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();
    res.setHeader(`${this.headerPrefix}-Limit${suffix}`, String(props.limit));
    res.setHeader(`${this.headerPrefix}-Remaining${suffix}`, '0');
  }

  private isIpKeyed(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(RATE_LIMIT_BY_IP, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

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
      // Token sai/hết hạn: về IP, không log (khuếch đại log); 401 do JwtAuthGuard báo.
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

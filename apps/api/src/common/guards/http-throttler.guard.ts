import { type ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable, warnRedisDown } from '../../infra/redis/redis-policy.js';
import { RATE_LIMIT_FAIL_CLOSED } from '../decorators.js';

/**
 * ThrottlerGuard toàn cục cũng chạy cho handler WebSocket, nhưng nó đọc ngữ cảnh
 * như HTTP: `req.ip` của socket là undefined (mọi socket chung MỘT bộ đếm) và
 * `res` là payload event (null → TypeError). Giới hạn tần suất cho socket nằm ở
 * gateway (theo từng socket); guard này chỉ lo HTTP.
 *
 * Bộ đếm nằm trên Redis. Redis chết: mặc định cho request đi tiếp (fail-open), riêng endpoint có
 * `@RateLimitFailClosed()` thì trả 503 (ADR-0026).
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  private readonly policyLogger = new Logger(HttpThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly redis: RedisProvider,
  ) {
    super(options, storageService, reflector);
  }

  override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    if (!this.redis.isUp) {
      return this.redisDown(props.context);
    }
    try {
      return await super.handleRequest(props);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error; // 429 do chính rate limit, không phải lỗi hạ tầng
      }
      return this.redisDown(props.context, error);
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

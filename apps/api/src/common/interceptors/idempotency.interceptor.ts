import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { catchError, from, mergeMap, type Observable, of } from 'rxjs';
import { z } from 'zod';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { redisUnavailable, warnRedisDown } from '../../infra/redis/redis-policy.js';
import { ErrorCodes } from '@ping/shared';

const PENDING = '__pending__';
const TTL_SECONDS = 24 * 60 * 60;
const uuid = z.uuid();

// Redis là nơi duy nhất chống tạo trùng: Redis chết + có header → 503 (fail-closed).
// Sau khi handler thành công, lỗi Redis chỉ log, không biến thao tác đã thành công thành lỗi.
// Request trùng key khi lần đầu còn chạy → 409; handler lỗi → xóa chỗ giữ.
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redis: RedisProvider) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId: string } }>();
    const key = request.header('idempotency-key');
    if (key === undefined) {
      return next.handle();
    }
    if (!uuid.safeParse(key).success) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Idempotency-Key must be a UUID',
      });
    }

    const redisKey = `idem:${request.user?.userId ?? 'anonymous'}:${request.method}:${request.originalUrl}:${key}`;
    if (!this.redis.isUp) {
      throw redisUnavailable();
    }
    let claimed: 'OK' | null;
    let stored: string | null = null;
    try {
      claimed = await this.redis.set(redisKey, PENDING, 'EX', TTL_SECONDS, 'NX');
      if (claimed === null) {
        stored = await this.redis.get(redisKey);
      }
    } catch (error) {
      warnRedisDown(this.logger, 'idempotency', error);
      throw redisUnavailable();
    }
    if (claimed === null) {
      if (stored === null || stored === PENDING) {
        throw new ConflictException('A request with this Idempotency-Key is still in progress');
      }
      return of(JSON.parse(stored) as unknown);
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        await this.redis
          .set(redisKey, JSON.stringify(body), 'EX', TTL_SECONDS)
          .catch((error: unknown) => warnRedisDown(this.logger, 'idempotency-store', error));
        return body;
      }),
      catchError((error: unknown) =>
        // Xóa chỗ giữ không được thì vẫn ném lỗi GỐC.
        from(this.redis.del(redisKey).catch(() => undefined)).pipe(
          mergeMap(() => {
            throw error;
          }),
        ),
      ),
    );
  }
}

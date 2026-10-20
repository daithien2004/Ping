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

/**
 * Header `Idempotency-Key` (quy tắc 12): client retry một request tạo dữ liệu với CÙNG key
 * nhận lại đúng response lần đầu thay vì tạo bản ghi thứ hai. Không gửi header thì chạy bình thường.
 *
 * Key gắn với user + method + URL, lưu trên Redis 24 giờ. Lần đầu giữ chỗ bằng SET NX;
 * request trùng key khi lần đầu còn đang chạy → 409. Handler lỗi → xóa chỗ để retry chạy lại.
 * Status code không cần lưu: Nest áp status của route (201) lên cả response phát lại.
 *
 * Redis là nơi DUY NHẤT chống tạo trùng ở đây, nên khi Redis chết mà request có header này thì
 * trả 503 (fail-closed, ADR-0026). Request không có header không bị ảnh hưởng. Sau khi handler
 * đã tạo xong, lỗi Redis (lưu response, xóa chỗ) chỉ được log: tuyệt đối không biến một thao tác
 * đã thành công thành lỗi.
 */
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
        // Handler lỗi: trả chỗ giữ để retry chạy lại. Xóa không được thì vẫn ném lỗi GỐC.
        from(this.redis.del(redisKey).catch(() => undefined)).pipe(
          mergeMap(() => {
            throw error;
          }),
        ),
      ),
    );
  }
}

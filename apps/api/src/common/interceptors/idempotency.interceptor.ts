import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { catchError, from, mergeMap, type Observable, of } from 'rxjs';
import { z } from 'zod';
import { RedisProvider } from '../../infra/redis/redis.module.js';

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
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisProvider) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId: string } }>();
    const key = request.header('idempotency-key');
    if (key === undefined) {
      return next.handle();
    }
    if (!uuid.safeParse(key).success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must be a UUID',
      });
    }

    const redisKey = `idem:${request.user?.userId ?? 'anonymous'}:${request.method}:${request.originalUrl}:${key}`;
    const claimed = await this.redis.set(redisKey, PENDING, 'EX', TTL_SECONDS, 'NX');
    if (claimed === null) {
      const stored = await this.redis.get(redisKey);
      if (stored === null || stored === PENDING) {
        throw new ConflictException('A request with this Idempotency-Key is still in progress');
      }
      return of(JSON.parse(stored) as unknown);
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        await this.redis.set(redisKey, JSON.stringify(body), 'EX', TTL_SECONDS);
        return body;
      }),
      catchError((error: unknown) =>
        from(this.redis.del(redisKey)).pipe(
          mergeMap(() => {
            throw error;
          }),
        ),
      ),
    );
  }
}

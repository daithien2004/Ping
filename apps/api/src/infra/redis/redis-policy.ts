import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';
import type { RedisProvider } from './redis.module.js';

/**
 * Chính sách khi Redis chết (ADR-0026). Hai cách xử lý, chọn theo thành phần:
 * - fail-open  (`failOpen`): Redis chưa sẵn sàng hoặc lệnh lỗi → dùng `fallback`, request đi tiếp.
 *   Cho cache, rate limit chung, phát event: mất chúng làm hệ thống kém đi chứ không sai.
 * - fail-closed (`redisUnavailable`): từ chối bằng 503. Cho thao tác mà Redis là lớp bảo vệ duy
 *   nhất (đăng nhập/đăng ký, Idempotency-Key): thà báo lỗi còn hơn bỏ lớp bảo vệ hoặc tạo trùng.
 */
export function redisUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    message: 'Service unavailable',
  });
}

const lastWarning = new Map<string, number>();
const WARN_EVERY_MS = 10_000;

/** Cảnh báo tối đa một lần mỗi 10 giây cho mỗi `key`: Redis chết thì mọi request đều trượt qua đây. */
export function warnRedisDown(logger: Logger, key: string, detail?: unknown): void {
  const now = Date.now();
  if (now - (lastWarning.get(key) ?? 0) < WARN_EVERY_MS) {
    return;
  }
  lastWarning.set(key, now);
  logger.warn(
    { dependency: 'redis', policy: key, cause: detail instanceof Error ? detail.name : detail },
    'redis unavailable, continuing without it',
  );
}

/** Chạy một thao tác Redis theo kiểu fail-open. Không gọi Redis khi biết nó chưa sẵn sàng. */
export async function failOpen<T>(
  redis: RedisProvider,
  logger: Logger,
  key: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!redis.isUp) {
    warnRedisDown(logger, key);
    return fallback;
  }
  try {
    return await run();
  } catch (error) {
    warnRedisDown(logger, key, error);
    return fallback;
  }
}

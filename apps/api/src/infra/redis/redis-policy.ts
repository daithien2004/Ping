import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';
import type { RedisProvider } from './redis.module.js';

// fail-open: dùng fallback, cho cache/rate limit/phát event. fail-closed (redisUnavailable): 503, cho thao tác mà Redis là lớp bảo vệ duy nhất.
export function redisUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    message: 'Service unavailable',
  });
}

const lastWarning = new Map<string, number>();
const WARN_EVERY_MS = 10_000;

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

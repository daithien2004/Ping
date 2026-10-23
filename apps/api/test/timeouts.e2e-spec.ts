import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from '../src/common/db-unavailable.js';
import type { Env } from '../src/config/env.schema.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

// Cấu hình giả lập: chỉ các khóa mà hai provider đọc.
function configWith(overrides: Partial<Record<keyof Env, unknown>>) {
  const values = { ...process.env, ...overrides } as Record<string, unknown>;
  return {
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`missing ${key}`);
      return values[key];
    },
  } as unknown as ConfigService<Env, true>;
}
const logger = { warn: () => undefined } as unknown as PinoLogger;

describe('timeouts on infrastructure calls (ADR-0026)', () => {
  const closers: Array<() => Promise<unknown>> = [];
  afterAll(async () => {
    await Promise.all(closers.map((close) => close()));
  });

  it('a slow Postgres query is cut at PG_QUERY_TIMEOUT_MS and reads as an outage', async () => {
    const prisma = new PrismaService(configWith({ PG_QUERY_TIMEOUT_MS: 300, PG_POOL_MAX: 5 }));
    await prisma.onModuleInit();
    closers.push(() => prisma.$disconnect());

    const started = Date.now();
    const error = await prisma.$queryRaw`select pg_sleep(5)`.catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(isDatabaseUnavailable(error)).toBe(true);
    // Sau khi bị cắt, kết nối vẫn dùng lại được.
    await expect(prisma.$queryRaw`select 1 as ok`).resolves.toEqual([{ ok: 1 }]);
  });

  it('a Redis command against an unreachable server fails fast instead of hanging', async () => {
    const redis = new RedisProvider(
      configWith({ REDIS_URL: 'redis://127.0.0.1:1', REDIS_COMMAND_TIMEOUT_MS: 300 }),
      logger,
    );
    closers.push(async () => redis.disconnect());

    expect(redis.isUp).toBe(false);
    const started = Date.now();
    await expect(redis.get('anything')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

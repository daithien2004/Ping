import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module.js';
import type { Env } from '../../src/config/env.schema.js';
import { ShutdownService } from '../../src/infra/lifecycle/shutdown.service.js';
import { RedisProvider } from '../../src/infra/redis/redis.module.js';

export const DEAD_REDIS = 'redis://localhost:6390'; // không ai nghe: mô phỏng đúng một Redis đã chết

/**
 * Dựng app thật (Postgres thật). `deadRedis` thay RedisProvider bằng một provider cùng class, cùng
 * tùy chọn timeout, trỏ vào cổng không có ai nghe: đúng đường chạy của một Redis đã chết.
 * (Đổi process.env không đủ: ConfigModule chụp cấu hình lúc import AppModule.)
 */
export async function bootApp(
  options: { deadRedis?: boolean; shutdown?: { graceMs: number; timeoutMs: number } } = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.deadRedis) {
    const config = {
      getOrThrow: (key: string) => ({ REDIS_URL: DEAD_REDIS, REDIS_COMMAND_TIMEOUT_MS: 1000 })[key],
    } as unknown as ConfigService<Env, true>;
    builder = builder
      .overrideProvider(RedisProvider)
      .useFactory({ factory: () => new RedisProvider(config, { warn: () => undefined } as never) });
  }
  if (options.shutdown) {
    const { graceMs, timeoutMs } = options.shutdown;
    const config = {
      getOrThrow: (key: string) =>
        ({ SHUTDOWN_GRACE_MS: graceMs, SHUTDOWN_TIMEOUT_MS: timeoutMs })[key],
    } as unknown as ConfigService<Env, true>;
    builder = builder
      .overrideProvider(ShutdownService)
      .useFactory({ factory: () => new ShutdownService(config) });
  }
  const app = (await builder.compile()).createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

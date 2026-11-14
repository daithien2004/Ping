import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import type { Env } from '../../src/config/env.schema.js';
import { ShutdownService } from '../../src/infra/lifecycle/shutdown.service.js';
import { RedisProvider } from '../../src/infra/redis/redis.module.js';
import { RedisIoAdapter } from '../../src/infra/socket/redis-io.adapter.js';

// Cổng 1 hầu như chắc chắn không ai nghe (ECONNREFUSED ngay); tránh cổng dev phổ biến vì container khác có thể chiếm.
export const DEAD_REDIS = 'redis://127.0.0.1:1';

/** Đổi process.env không đủ: ConfigModule chụp cấu hình lúc import AppModule. */
export async function bootApp(
  options: {
    deadRedis?: boolean;
    shutdown?: { graceMs: number; timeoutMs: number };
    websocket?: boolean;
  } = {},
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
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  configureApp(app);
  if (options.websocket) {
    const redis = app.get(RedisProvider);
    const webOrigin = app.get(ConfigService<Env, true>).getOrThrow('WEB_ORIGIN', { infer: true });
    app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));
    await app.listen(0);
    return app;
  }
  await app.init();
  return app;
}

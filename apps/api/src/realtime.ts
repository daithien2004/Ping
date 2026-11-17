import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env.schema.js';
import { MetricsService } from './infra/metrics/metrics.service.js';
import { RedisProvider } from './infra/redis/redis.module.js';
import { RedisIoAdapter } from './infra/socket/redis-io.adapter.js';
import { initTracing } from './infra/tracing/tracing.js';
import { RealtimeAppModule } from './realtime-app.module.js';

// Service Realtime (ADR-0098): giữ kết nối WebSocket; API phát tới đây qua Redis adapter.
async function bootstrap() {
  initTracing('ping-realtime');
  const app = await NestFactory.create<NestExpressApplication>(RealtimeAppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  const config = app.get(ConfigService<Env, true>);
  app.set('trust proxy', config.getOrThrow('TRUST_PROXY', { infer: true }));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const redis = app.get(RedisProvider);
  const webOrigin = config.getOrThrow('WEB_ORIGIN', { infer: true });
  app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));

  const metricsPort = config.get('METRICS_PORT', { infer: true });
  if (metricsPort) await app.get(MetricsService).listen(metricsPort);
  await app.listen(config.getOrThrow('PORT', { infer: true }));
}
await bootstrap();

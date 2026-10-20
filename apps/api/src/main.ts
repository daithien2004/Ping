import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.schema.js';
import { MetricsService } from './infra/metrics/metrics.service.js';
import { initSentry } from './infra/sentry/sentry.js';
import { RedisProvider } from './infra/redis/redis.module.js';
import { RedisIoAdapter } from './infra/socket/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = app.get(ConfigService<Env, true>);
  const nodeEnv = config.getOrThrow('NODE_ENV', { infer: true });
  const port = config.getOrThrow('PORT', { infer: true });
  const webOrigin = config.getOrThrow('WEB_ORIGIN', { infer: true });

  initSentry(config.get('SENTRY_DSN', { infer: true }));
  configureApp(app);
  app.enableShutdownHooks();

  // Redis adapter cho Socket.IO (cluster/multi-instance) — dùng pub/sub cùng Redis.
  // Truyền `app` để WS share HTTP server (cùng cổng REST) thay vì mở cổng riêng.
  const redis = app.get(RedisProvider);
  app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ping API')
      .setDescription('Discord-style chat API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const metricsPort = config.get('METRICS_PORT', { infer: true });
  if (metricsPort) {
    await app.get(MetricsService).listen(metricsPort);
  }
  await app.listen(port);
}
await bootstrap();

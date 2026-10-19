import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { RedisProvider } from './infra/redis/redis.module.js';
import { RedisIoAdapter } from './infra/socket/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = app.get(ConfigService<Env, true>);
  const nodeEnv = config.getOrThrow('NODE_ENV');
  const port = config.getOrThrow('PORT');
  const webOrigin = config.getOrThrow('WEB_ORIGIN');

  app.use(helmet());
  // Đọc cookie httpOnly (refresh token) — req.cookies do cookie-parser gắn vào.
  app.use(cookieParser());
  app.enableCors({ origin: webOrigin, credentials: true });
  app.setGlobalPrefix('api/v1');
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

  await app.listen(port);
}
await bootstrap();

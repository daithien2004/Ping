import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { assignRequestId } from './common/request-id.js';
import { MetricsService } from './infra/metrics/metrics.service.js';
import type { Env } from './config/env.schema.js';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const webOrigin = config.getOrThrow('WEB_ORIGIN', { infer: true });

  app.set('trust proxy', config.getOrThrow('TRUST_PROXY', { infer: true }));
  app.use(assignRequestId);
  app.use(app.get(MetricsService).middleware);
  app.use(helmet());
  // 32 KB đủ cho mọi body hợp lệ (tin nhắn tối đa 4000 ký tự).
  app.useBodyParser('json', { limit: '32kb' });
  app.use(cookieParser());
  // exposedHeaders: X-Request-Id và header rate limit phải khai báo, nếu không JS không đọc được response khác origin.
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  });
  app.setGlobalPrefix('api/v1');
}

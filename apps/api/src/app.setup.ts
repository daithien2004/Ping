import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { assignRequestId } from './common/request-id.js';
import type { Env } from './config/env.schema.js';

/**
 * Cấu hình HTTP dùng chung cho main.ts VÀ e2e (test/helpers/boot.ts): header bảo mật, giới hạn
 * body, cookie, CORS, prefix. Một nơi duy nhất để test chạy đúng cấu hình production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const webOrigin = config.getOrThrow('WEB_ORIGIN', { infer: true });

  app.set('trust proxy', config.getOrThrow('TRUST_PROXY', { infer: true }));
  app.use(assignRequestId);
  app.use(helmet());
  // Tin nhắn tối đa 4000 ký tự; 32 KB đủ cho mọi body hợp lệ và chặn body khổng lồ ngay ở parser.
  app.useBodyParser('json', { limit: '32kb' });
  // Đọc cookie httpOnly (refresh token) — req.cookies do cookie-parser gắn vào.
  app.use(cookieParser());
  // exposedHeaders: trình duyệt chỉ cho JS đọc header X-Request-Id của response khác origin
  // khi API khai báo rõ — web cần nó để hiển thị "Mã lỗi" (hướng dẫn 15.1.1).
  app.enableCors({ origin: webOrigin, credentials: true, exposedHeaders: ['X-Request-Id'] });
  app.setGlobalPrefix('api/v1');
}

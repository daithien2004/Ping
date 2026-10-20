import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE, ErrorCodes } from '@ping/shared';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';

/**
 * Chống CSRF cho endpoint xác thực bằng cookie (/auth/refresh, /auth/logout; ADR-0027).
 * Cookie refresh là SameSite=Lax nên trang khác site không gửi kèm được; guard này là lớp thứ hai,
 * chặn cả trường hợp cùng site (subdomain khác, XSS ở site anh em) bằng hai điều kiện CÙNG LÚC:
 * - `Origin` đúng bằng WEB_ORIGIN (trình duyệt luôn gửi Origin cho POST; thiếu = không phải web của ta);
 * - header `X-Ping-Client: web` (bắt buộc preflight CORS khi gọi từ origin khác).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService<Env, true>) {
    // new URL().origin chuẩn hóa ("http://localhost:3000/" → "http://localhost:3000").
    this.allowedOrigin = new URL(config.getOrThrow('WEB_ORIGIN', { infer: true })).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.headers.origin !== this.allowedOrigin ||
      request.header(CLIENT_HEADER) !== CLIENT_HEADER_VALUE
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Invalid request origin',
      });
    }
    return true;
  }
}

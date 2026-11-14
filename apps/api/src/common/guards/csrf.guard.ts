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

// Cần CÙNG LÚC: Origin == WEB_ORIGIN và header X-Ping-Client: web (bắt preflight CORS); lớp thứ hai ngoài SameSite=Lax.
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService<Env, true>) {
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

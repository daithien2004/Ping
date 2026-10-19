import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const uuid = z.uuid();

/**
 * Mọi tham số route tên `*Id` phải là UUID. Cột id là kiểu `uuid` của Postgres:
 * chuỗi rác lọt xuống Prisma sẽ thành lỗi 500 thay vì 400.
 *
 * Là guard toàn cục (không phải pipe) vì pipe chạy SAU guard, mà AbilityGuard
 * đã dùng `params.serverId/channelId/...` để query DB trước khi tới controller.
 */
@Injectable()
export class UuidParamsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const params = context.switchToHttp().getRequest<Request>().params as Record<string, string>;
    const invalid = Object.entries(params)
      .filter(([name, value]) => name.endsWith('Id') && !uuid.safeParse(value).success)
      .map(([name]) => ({ path: name, code: 'invalid_format', message: 'Invalid UUID' }));

    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: invalid,
      });
    }
    return true;
  }
}

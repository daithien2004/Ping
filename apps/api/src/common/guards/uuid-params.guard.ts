import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ErrorCodes } from '@ping/shared';

const uuid = z.uuid();

// Guard toàn cục, không phải pipe: pipe chạy SAU guard mà AbilityGuard đã dùng params để query DB; id rác sẽ thành 500.
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
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: invalid,
      });
    }
    return true;
  }
}

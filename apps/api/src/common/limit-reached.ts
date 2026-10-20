import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';

/** Vượt trần số lượng (shared/limits.ts, ADR-0028): 400 VALIDATION_ERROR kèm details để client hiển thị. */
export function limitReached(resource: string, max: number): BadRequestException {
  return new BadRequestException({
    code: ErrorCodes.VALIDATION_ERROR,
    message: 'Limit reached',
    details: [
      { path: resource, code: 'too_big', message: `At most ${max} ${resource} are allowed` },
    ],
  });
}

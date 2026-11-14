import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';

export function limitReached(resource: string, max: number): BadRequestException {
  return new BadRequestException({
    code: ErrorCodes.VALIDATION_ERROR,
    message: 'Limit reached',
    details: [
      { path: resource, code: 'too_big', message: `At most ${max} ${resource} are allowed` },
    ],
  });
}

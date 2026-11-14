import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';

export class TooManyRequestsError extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Too many requests') {
    super({ code: ErrorCodes.TOO_MANY_REQUESTS, message }, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

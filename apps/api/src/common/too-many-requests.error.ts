import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';

/**
 * 429 có mã trong ErrorCodes và thời gian chờ. AllExceptionsFilter đặt header `Retry-After` từ
 * `retryAfterSeconds` để client (và web) biết bao lâu nữa thử lại được.
 */
export class TooManyRequestsError extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Too many requests') {
    super({ code: ErrorCodes.TOO_MANY_REQUESTS, message }, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

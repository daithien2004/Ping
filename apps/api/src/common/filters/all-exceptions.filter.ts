import { ForbiddenError } from '@casl/ability';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes, isErrorCode, type ApiErrorBody, type ErrorCode } from '@ping/shared';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodes.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCodes.SERVICE_UNAVAILABLE,
};

/** Mã lỗi cho một status không có code riêng: luôn nằm trong danh mục ErrorCodes. */
function codeForStatus(status: number): ErrorCode {
  return (
    STATUS_CODES[status] ?? (status >= 500 ? ErrorCodes.INTERNAL_ERROR : ErrorCodes.BAD_REQUEST)
  );
}

/**
 * Single filter that turns every thrown exception into the uniform error
 * shape `{ code, message, details?, requestId }`. Stacks and internal
 * messages never reach the client in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigService<Env>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id ?? 'unknown';
    const isProduction = this.config.get('NODE_ENV') === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode | undefined;
    let message: string = 'Internal server error';
    let details: unknown;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        if (typeof record.message === 'string') {
          message = record.message;
        } else if (Array.isArray(record.message)) {
          details = record.message;
        }
        // Chỉ nhận code thuộc danh mục (quy tắc 14); code tự chế bị thay bằng code theo status.
        if (isErrorCode(record.code)) {
          code = record.code;
        }
        if (record.details !== undefined) {
          details = record.details;
        }
      }

      // A controlled HttpException never carries a stack: the response was
      // built on purpose (e.g. terminus throwing 503 during a readiness
      // probe). Stacks belong only to genuinely unexpected errors below.
      if (status >= 500 && isProduction) {
        message = 'Internal server error';
      }
    } else if (exception instanceof ForbiddenError) {
      // CASL throwUnlessCan — lỗi "có chủ đích",403 format thống nhất, không stack.
      status = HttpStatus.FORBIDDEN;
      code = ErrorCodes.FORBIDDEN;
      message = exception.message;
    } else if (exception instanceof Error) {
      stack = exception.stack;
      message = exception.message;
      if (isProduction) {
        message = 'Internal server error';
      }
    }

    code ??= codeForStatus(status);

    if (stack !== undefined) {
      // Not an HttpException: something crashed unexpectedly — keep the stack.
      this.logger.error(
        { requestId, status, code, path: request.url, stack },
        'unhandled exception',
      );
    } else if (status >= 500) {
      // Deliberate 5xx (e.g. readiness probe while a dependency is down):
      // error-level because it matters, but no stack — nothing was unhandled.
      this.logger.error({ requestId, status, code, path: request.url }, 'server error');
    } else {
      this.logger.warn({ requestId, status, code, path: request.url }, 'request rejected');
    }

    const payload: ApiErrorBody & { stack?: string } = { code, message, requestId };
    if (details !== undefined) {
      payload.details = details;
    }
    if (stack !== undefined && !isProduction) {
      payload.stack = stack;
    }

    response.status(status).json(payload);
  }
}

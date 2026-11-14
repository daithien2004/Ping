import { ForbiddenError } from '@casl/ability';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCodes,
  errorCodeForStatus,
  isErrorCode,
  type ApiErrorBody,
  type ErrorCode,
} from '@ping/shared';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';
import { captureServerError } from '../../infra/sentry/sentry.js';
import { isDatabaseUnavailable } from '../db-unavailable.js';
import { TooManyRequestsError } from '../too-many-requests.error.js';

function isExposedClientError(error: unknown): error is Error & { status: number } {
  const { status, expose } = (error ?? {}) as { status?: unknown; expose?: unknown };
  return (
    error instanceof Error &&
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigService<Env>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: { userId?: string } }>();
    const requestId = request.id ?? 'unknown';
    const isProduction = this.config.get('NODE_ENV') === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode | undefined;
    let message: string = 'Internal server error';
    let details: unknown;
    let stack: string | undefined;
    let logContext: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (exception instanceof TooManyRequestsError) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
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
        if (isErrorCode(record.code)) {
          code = record.code;
        }
        if (record.details !== undefined) {
          details = record.details;
        }
      }

      if (status >= 500 && isProduction) {
        message = 'Internal server error';
      }
    } else if (exception instanceof ForbiddenError) {
      status = HttpStatus.FORBIDDEN;
      code = ErrorCodes.FORBIDDEN;
      message = exception.message;
    } else if (isExposedClientError(exception)) {
      status = exception.status;
      message = status === 413 ? 'Payload too large' : 'Bad request';
    } else if (isDatabaseUnavailable(exception)) {
      // Hạ tầng hỏng: 503 + requestId, không stack, không lộ chi tiết driver (host, port).
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = ErrorCodes.SERVICE_UNAVAILABLE;
      message = 'Service unavailable';
      logContext = { dependency: 'postgres', cause: (exception as Error).name };
    } else if (exception instanceof Error) {
      stack = exception.stack;
      message = exception.message;
      if (isProduction) {
        message = 'Internal server error';
      }
    }

    code ??= errorCodeForStatus(status);

    if (stack !== undefined) {
      this.logger.error(
        { requestId, status, code, path: request.url.split('?')[0], stack },
        'unhandled exception',
      );
      captureServerError(exception, { requestId, userId: request.user?.userId });
    } else if (status >= 500) {
      this.logger.error(
        { requestId, status, code, path: request.url.split('?')[0], ...logContext },
        'server error',
      );
    } else {
      this.logger.warn(
        { requestId, status, code, path: request.url.split('?')[0] },
        'request rejected',
      );
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

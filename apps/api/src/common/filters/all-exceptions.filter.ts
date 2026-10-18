import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

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
    let code = 'INTERNAL_ERROR';
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
        if (typeof record.code === 'string') {
          code = record.code;
        }
        if (record.details !== undefined) {
          details = record.details;
        }
      }

      if (code === 'INTERNAL_ERROR') {
        code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
      }
      // A controlled HttpException never carries a stack: the response was
      // built on purpose (e.g. terminus throwing 503 during a readiness
      // probe). Stacks belong only to genuinely unexpected errors below.
      if (status >= 500 && isProduction) {
        message = 'Internal server error';
      }
    } else if (exception instanceof Error) {
      stack = exception.stack;
      message = exception.message;
      if (isProduction) {
        message = 'Internal server error';
      }
    }

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

    const payload: Record<string, unknown> = { code, message, requestId };
    if (details !== undefined) {
      payload.details = details;
    }
    if (stack !== undefined && !isProduction) {
      payload.stack = stack;
    }

    response.status(status).json(payload);
  }
}

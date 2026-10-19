import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  MethodNotAllowedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '@ping/shared';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.schema.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: 'req-1', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  const logger = { warn: () => undefined, error: () => undefined } as unknown as Logger;
  const config = { get: () => 'test' } as unknown as ConfigService<Env>;

  new AllExceptionsFilter(logger, config).catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter', () => {
  it('keeps a code from the ErrorCodes catalog', () => {
    const sent = run(new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR, message: 'x' }));
    expect(sent).toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_ERROR', requestId: 'req-1' },
    });
  });

  it('never leaks a free-form code: falls back to the status mapping', () => {
    const sent = run(
      new HttpException({ code: 'SOMETHING_ADHOC', message: 'x' }, HttpStatus.CONFLICT),
    );
    expect(sent.body?.code).toBe(ErrorCodes.CONFLICT);
  });

  it('maps unlisted 4xx statuses to a catalog code', () => {
    expect(run(new MethodNotAllowedException()).body?.code).toBe(ErrorCodes.BAD_REQUEST);
  });

  it('maps unexpected errors to INTERNAL_ERROR with status 500', () => {
    expect(run(new Error('boom'))).toMatchObject({
      status: 500,
      body: { code: ErrorCodes.INTERNAL_ERROR },
    });
  });
});

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

  it('maps Express middleware client errors (body too large, malformed JSON) to their 4xx', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(run(tooLarge)).toMatchObject({
      status: 413,
      body: { code: ErrorCodes.BAD_REQUEST, message: 'Payload too large', requestId: 'req-1' },
    });
    const malformed = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
      type: 'entity.parse.failed',
    });
    const sent = run(malformed);
    expect(sent).toMatchObject({ status: 400, body: { code: ErrorCodes.BAD_REQUEST } });
    expect(JSON.stringify(sent.body)).not.toContain('Unexpected token'); // không lộ chi tiết parser
  });

  it('does not trust an error that only has a status field (no expose flag)', () => {
    expect(run(Object.assign(new Error('boom'), { status: 413 }))).toMatchObject({ status: 500 });
  });

  it('maps a database outage to 503 SERVICE_UNAVAILABLE without leaking driver details', () => {
    const outage = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      name: 'PrismaClientKnownRequestError',
      code: 'ECONNREFUSED',
    });
    const sent = run(outage);
    expect(sent).toMatchObject({
      status: 503,
      body: { code: ErrorCodes.SERVICE_UNAVAILABLE, requestId: 'req-1' },
    });
    expect(JSON.stringify(sent.body)).not.toContain('5432');
  });

  it('maps unexpected errors to INTERNAL_ERROR with status 500', () => {
    expect(run(new Error('boom'))).toMatchObject({
      status: 500,
      body: { code: ErrorCodes.INTERNAL_ERROR },
    });
  });
});

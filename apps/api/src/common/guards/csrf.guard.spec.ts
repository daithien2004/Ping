import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.schema.js';
import { CsrfGuard } from './csrf.guard.js';

const guard = (webOrigin = 'http://localhost:3000') =>
  new CsrfGuard({ getOrThrow: () => webOrigin } as unknown as ConfigService<Env, true>);

function contextWith(headers: Record<string, string>): ExecutionContext {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const request = { headers: lower, header: (name: string) => lower[name.toLowerCase()] };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const valid = { Origin: 'http://localhost:3000', 'X-Ping-Client': 'web' };

  it('allows the web origin with the custom header', () => {
    expect(guard().canActivate(contextWith(valid))).toBe(true);
  });

  it('tolerates a trailing slash in WEB_ORIGIN configuration', () => {
    expect(guard('http://localhost:3000/').canActivate(contextWith(valid))).toBe(true);
  });

  it.each([
    ['no Origin (not a browser request from our web app)', { 'X-Ping-Client': 'web' }],
    ['another origin', { ...valid, Origin: 'https://evil.example' }],
    ['a look-alike origin', { ...valid, Origin: 'http://localhost:3000.evil.example' }],
    ['a different port', { ...valid, Origin: 'http://localhost:3001' }],
    ['no custom header', { Origin: 'http://localhost:3000' }],
    ['a wrong custom header value', { ...valid, 'X-Ping-Client': 'mobile' }],
  ])('rejects %s with 403', (_name, headers) => {
    expect(() => guard().canActivate(contextWith(headers))).toThrow(ForbiddenException);
  });
});

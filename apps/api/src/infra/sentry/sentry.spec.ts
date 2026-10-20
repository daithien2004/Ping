import * as Sentry from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { initSentry, scrubEvent } from './sentry.js';

describe('initSentry', () => {
  it('does nothing without a DSN: SDK not initialised, nothing can be sent', () => {
    expect(initSentry(undefined)).toBe(false);
    expect(Sentry.isEnabled()).toBe(false);
  });
});

describe('scrubEvent', () => {
  const event = {
    message: 'boom',
    request: {
      url: 'https://api/x?token=abc',
      method: 'POST',
      data: { content: 'tin nhắn bí mật', password: 'hunter2' },
      cookies: { refresh: 'r' },
      headers: { authorization: 'Bearer t', cookie: 'refresh=r' },
      query_string: 'token=abc',
    },
    user: { id: 'u1', ip_address: '1.2.3.4', email: 'a@b.c' },
    tags: { requestId: 'req-1' },
  } as unknown as Sentry.ErrorEvent;

  it('drops the request body, cookies, headers and query string', () => {
    const out = scrubEvent(structuredClone(event))!;
    expect(out.request).toEqual({ method: 'POST', url: 'https://api/x' });
    expect(JSON.stringify(out)).not.toMatch(/hunter2|bí mật|Bearer|refresh=|token=abc/);
  });

  it('keeps only the user id, and the tags that link to backend logs', () => {
    const out = scrubEvent(structuredClone(event))!;
    expect(out.user).toEqual({ id: 'u1' });
    expect(out.tags).toEqual({ requestId: 'req-1' });
  });
});

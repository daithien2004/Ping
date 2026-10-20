import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it, vi } from 'vitest';
import { reportError } from './report-error';
import { initSentryBrowser, scrubBrowserEvent } from './sentry';

describe('without a DSN', () => {
  it('initSentryBrowser does nothing (no SDK is even imported)', async () => {
    await expect(initSentryBrowser(undefined)).resolves.toBe(false);
  });

  it('reportError only logs to the console', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportError(new Error('x'), { boundary: 'app-error' });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe('scrubBrowserEvent', () => {
  const event = {
    message: 'boom',
    request: {
      url: 'https://ping.example/servers/1?invite=abc',
      headers: { cookie: 'x', 'User-Agent': 'ua' },
      cookies: { a: 'b' },
      data: 'nội dung',
    },
    user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    tags: { requestId: 'req-1', other: 'x' },
    breadcrumbs: [{ message: 'tin nhắn bí mật' }],
  } as unknown as ErrorEvent;

  it('keeps only the url without the query, the user id and the requestId tag', () => {
    const out = scrubBrowserEvent(structuredClone(event))!;
    expect(out.request).toEqual({ url: 'https://ping.example/servers/1' });
    expect(out.user).toEqual({});
    expect(out.tags).toEqual({ requestId: 'req-1' });
    expect(out.breadcrumbs).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/bí mật|nội dung|invite=abc|a@b\.c/);
  });
});

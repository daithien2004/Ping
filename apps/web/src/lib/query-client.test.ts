import { ErrorCodes } from '@ping/shared';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client';
import { clearSessionQueries, shouldRetryRequest } from './query-client';
import { qk } from './query-keys';

describe('query-client retry (ADR-0078)', () => {
  it('không thử lại 4xx, kể cả 429 (hàng đợi api-client lo việc chờ Retry-After)', () => {
    const tooMany = new ApiError(429, ErrorCodes.TOO_MANY_REQUESTS, 'Slow down');
    expect(shouldRetryRequest(0, tooMany)).toBe(false);
    expect(shouldRetryRequest(1, tooMany)).toBe(false);
    expect(shouldRetryRequest(0, new ApiError(404, ErrorCodes.NOT_FOUND, 'x'))).toBe(false);
  });

  it('thử lại lỗi mạng/5xx tối đa 2 lần', () => {
    expect(shouldRetryRequest(0, new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'offline'))).toBe(
      true,
    );
    expect(shouldRetryRequest(1, new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'boom'))).toBe(true);
    expect(shouldRetryRequest(2, new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'boom'))).toBe(false);
  });
});

describe('clearSessionQueries (ADR-0018)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('xóa mọi query trừ me và bản lưu localStorage', () => {
    const storage = new Map<string, string>([['ping:query-cache', '{"version":1}']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
    const client = new QueryClient();
    client.setQueryData(qk.me, { id: 'u1' });
    client.setQueryData(qk.servers, [{ id: 's1' }]);
    client.setQueryData(qk.messages('c1'), [{ id: 'm1' }]);

    clearSessionQueries(client);

    expect(client.getQueryData(qk.me)).toEqual({ id: 'u1' });
    expect(client.getQueryData(qk.servers)).toBeUndefined();
    expect(client.getQueryData(qk.messages('c1'))).toBeUndefined();
    expect(storage.has('ping:query-cache')).toBe(false);
  });
});

import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { shouldRetryRequest } from './query-client';

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

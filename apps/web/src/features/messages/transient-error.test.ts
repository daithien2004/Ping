import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { isTransientError } from './transient-error';

const apiError = (status: number) => new ApiError(status, ErrorCodes.INTERNAL_ERROR, 'x');

describe('isTransientError', () => {
  it('mất mạng (status 0) và lỗi server (5xx) là tạm thời', () => {
    expect(isTransientError(apiError(0))).toBe(true);
    expect(isTransientError(apiError(500))).toBe(true);
    expect(isTransientError(apiError(503))).toBe(true);
  });
  it('lỗi 4xx là kết quả rõ ràng, không phải tạm thời', () => {
    expect(isTransientError(apiError(400))).toBe(false);
    expect(isTransientError(apiError(403))).toBe(false);
    expect(isTransientError(apiError(404))).toBe(false);
  });
  it('không phải ApiError thì không phải', () => {
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

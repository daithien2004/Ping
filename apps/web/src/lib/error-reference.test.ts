import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { errorReference } from './error-reference';

describe('errorReference', () => {
  it('uses the requestId of an API error (the id the backend logs)', () => {
    expect(errorReference(new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'x', 'req-1'))).toBe(
      'req-1',
    );
  });

  it('uses the digest Next attaches to errors thrown on the server', () => {
    expect(errorReference(Object.assign(new Error('x'), { digest: 'abc123' }))).toBe('abc123');
  });

  it('is undefined when there is nothing to quote', () => {
    expect(
      errorReference(new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'offline')),
    ).toBeUndefined();
    expect(errorReference(new Error('x'))).toBeUndefined();
    expect(errorReference(undefined)).toBeUndefined();
    expect(errorReference(Object.assign(new Error('x'), { digest: 5 }))).toBeUndefined();
  });
});

import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { describeError } from './error-message';

const apiError = (status: number, code: keyof typeof ErrorCodes, requestId?: string) =>
  new ApiError(status, ErrorCodes[code], 'server text', requestId);

describe('describeError', () => {
  it('câu chung theo code, không dùng message của server', () => {
    expect(describeError(apiError(403, 'FORBIDDEN'))).toEqual({ key: 'FORBIDDEN' });
    expect(describeError(apiError(0, 'SERVICE_UNAVAILABLE'))).toEqual({
      key: 'SERVICE_UNAVAILABLE',
    });
    expect(describeError(apiError(429, 'TOO_MANY_REQUESTS'))).toEqual({
      key: 'TOO_MANY_REQUESTS',
    });
  });

  it('override theo ngữ cảnh thắng câu chung, chỉ cho đúng code đó', () => {
    const overrides = { FORBIDDEN: 'Bạn không có quyền tạo channel.' };
    expect(describeError(apiError(403, 'FORBIDDEN'), overrides)).toEqual({
      text: 'Bạn không có quyền tạo channel.',
    });
    expect(describeError(apiError(404, 'NOT_FOUND'), overrides)).toEqual({ key: 'NOT_FOUND' });
  });

  it('lỗi không lường trước kèm requestId; không có requestId hay không phải ApiError → chung', () => {
    expect(describeError(apiError(500, 'INTERNAL_ERROR', 'req-1'))).toEqual({
      key: 'unknownWithId',
      requestId: 'req-1',
    });
    expect(describeError(apiError(500, 'INTERNAL_ERROR'))).toEqual({ key: 'unknown' });
    expect(describeError(new Error('x'))).toEqual({ key: 'unknown' });
  });
});

import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { errorMessage } from './error-message';

const apiError = (status: number, code: keyof typeof ErrorCodes, requestId?: string) =>
  new ApiError(status, ErrorCodes[code], 'server text', requestId);

describe('errorMessage', () => {
  it('câu mặc định theo code', () => {
    expect(errorMessage(apiError(403, 'FORBIDDEN'))).toBe('Bạn không có quyền làm việc này.');
    expect(errorMessage(apiError(404, 'NOT_FOUND'))).toBe('Không tìm thấy.');
    expect(errorMessage(apiError(0, 'SERVICE_UNAVAILABLE'))).toBe('Không kết nối được máy chủ.');
    expect(errorMessage(apiError(429, 'TOO_MANY_REQUESTS'))).toBe(
      'Thử quá nhiều lần. Đợi một phút rồi thử lại.',
    );
  });

  it('câu riêng theo ngữ cảnh ghi đè câu mặc định', () => {
    expect(
      errorMessage(apiError(403, 'FORBIDDEN'), { FORBIDDEN: 'Bạn không có quyền tạo channel.' }),
    ).toBe('Bạn không có quyền tạo channel.');
  });

  it('không bao giờ hiện câu chữ của server (tiếng Anh, có thể đổi): BAD_REQUEST dùng câu chung', () => {
    expect(errorMessage(apiError(400, 'BAD_REQUEST'))).toBe('Yêu cầu không hợp lệ.');
    expect(errorMessage(apiError(400, 'BAD_REQUEST'), { BAD_REQUEST: 'Câu riêng.' })).toBe(
      'Câu riêng.',
    );
  });

  it('lỗi không lường trước kèm mã lỗi; lỗi không phải ApiError thì câu chung', () => {
    expect(errorMessage(apiError(500, 'INTERNAL_ERROR', 'req-1'))).toBe(
      'Có lỗi xảy ra. Mã lỗi: req-1',
    );
    expect(errorMessage(new Error('x'))).toBe('Có lỗi xảy ra.');
  });
});

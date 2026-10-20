import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { authErrorMessage, safeRedirectPath } from './session';

describe('safeRedirectPath', () => {
  it('giữ đường dẫn nội bộ', () => {
    expect(safeRedirectPath('/servers/abc/channels/def')).toBe('/servers/abc/channels/def');
    expect(safeRedirectPath('/?tab=1')).toBe('/?tab=1');
  });

  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['servers'],
    [''],
    [null],
  ])('từ chối %j (open redirect) → "/"', (next) => {
    expect(safeRedirectPath(next)).toBe('/');
  });
});

describe('authErrorMessage', () => {
  const error = (status: number, code: keyof typeof ErrorCodes, requestId?: string) =>
    new ApiError(status, ErrorCodes[code], 'server message', requestId);

  it('sai mật khẩu khi đăng nhập', () => {
    expect(authErrorMessage(error(401, 'UNAUTHORIZED'), 'login')).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('trùng email/username khi đăng ký', () => {
    expect(authErrorMessage(error(409, 'CONFLICT'), 'register')).toBe(
      'Email hoặc tên người dùng đã được dùng.',
    );
  });

  it('bị rate limit', () => {
    expect(authErrorMessage(error(429, 'TOO_MANY_REQUESTS'), 'login')).toBe(
      'Thử quá nhiều lần. Đợi một phút rồi thử lại.',
    );
  });

  it('mất kết nối', () => {
    expect(authErrorMessage(error(0, 'SERVICE_UNAVAILABLE'), 'login')).toBe(
      'Không kết nối được máy chủ.',
    );
  });

  it('lỗi khác kèm mã lỗi để báo cho admin; không có requestId thì bỏ phần mã', () => {
    expect(authErrorMessage(error(500, 'INTERNAL_ERROR', 'req-9'), 'login')).toBe(
      'Có lỗi xảy ra. Mã lỗi: req-9',
    );
    expect(authErrorMessage(new Error('boom'), 'register')).toBe('Có lỗi xảy ra.');
  });
});

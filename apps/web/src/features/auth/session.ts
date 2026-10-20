import { ErrorCodes } from '@ping/shared';
import { ApiError } from '@/lib/api-client';

/**
 * Chỉ chấp nhận đường dẫn nội bộ cho `?next=` (chống open redirect: link
 * `/login?next=https://trang-gia.com` không được dẫn người vừa đăng nhập ra ngoài).
 * `//host` và `/\host` trình duyệt hiểu là URL tuyệt đối tới host khác, nên cũng bị chặn.
 */
export function safeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  return next;
}

/**
 * Câu báo lỗi cho form đăng nhập/đăng ký, chọn theo `code` (không theo `message` của server:
 * câu chữ server có thể đổi, code thì là hợp đồng — hướng dẫn 16.7).
 */
export function authErrorMessage(error: unknown, action: 'login' | 'register'): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ErrorCodes.UNAUTHORIZED:
        if (action === 'login') return 'Email hoặc mật khẩu không đúng.';
        break;
      case ErrorCodes.CONFLICT:
        if (action === 'register') return 'Email hoặc tên người dùng đã được dùng.';
        break;
      case ErrorCodes.TOO_MANY_REQUESTS:
        return 'Thử quá nhiều lần. Đợi một phút rồi thử lại.';
      case ErrorCodes.SERVICE_UNAVAILABLE:
        return 'Không kết nối được máy chủ.';
    }
    if (error.requestId) {
      return `Có lỗi xảy ra. Mã lỗi: ${error.requestId}`;
    }
  }
  return 'Có lỗi xảy ra.';
}

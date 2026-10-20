import { ErrorCodes, type ErrorCode } from '@ping/shared';
import { ApiError } from './api-client';

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCodes.BAD_REQUEST]: 'Yêu cầu không hợp lệ.',
  [ErrorCodes.UNAUTHORIZED]: 'Phiên đăng nhập đã hết. Đăng nhập lại.',
  [ErrorCodes.FORBIDDEN]: 'Bạn không có quyền làm việc này.',
  [ErrorCodes.NOT_FOUND]: 'Không tìm thấy.',
  [ErrorCodes.CONFLICT]: 'Dữ liệu bị trùng.',
  [ErrorCodes.TOO_MANY_REQUESTS]: 'Thử quá nhiều lần. Đợi một phút rồi thử lại.',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Không kết nối được máy chủ.',
};

/**
 * Câu báo lỗi cho người dùng, chọn theo `ApiError.code` (hợp đồng), không theo `message` của
 * server (hướng dẫn 16.7): câu của server là tiếng Anh và có thể đổi. `overrides` cho câu riêng
 * theo ngữ cảnh ("Không có quyền tạo channel", "Chủ server không thể rời server").
 * Lỗi không lường trước kèm requestId để người dùng báo lại.
 */
export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ErrorCode, string>> = {},
): string {
  if (error instanceof ApiError) {
    const known = overrides[error.code] ?? DEFAULT_MESSAGES[error.code];
    if (known) {
      return known;
    }
    if (error.requestId) {
      return `Có lỗi xảy ra. Mã lỗi: ${error.requestId}`;
    }
  }
  return 'Có lỗi xảy ra.';
}

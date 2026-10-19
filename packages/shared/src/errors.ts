/**
 * Danh mục mã lỗi API (quy tắc 14). Mọi response lỗi có `code` thuộc danh mục này;
 * client rẽ nhánh theo `code`, không theo `message` (message có thể đổi câu chữ).
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const knownCodes = new Set<string>(Object.values(ErrorCodes));

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && knownCodes.has(value);
}

/** Hình dạng body của mọi response lỗi từ API. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

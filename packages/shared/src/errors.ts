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
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_REVOKED: 'INVITE_REVOKED',
  SEARCH_QUERY_INVALID: 'SEARCH_QUERY_INVALID',
  /** Tin đã có 20 loại cảm xúc khác nhau (TG.2, ADR-0064). */
  REACTION_LIMIT_REACHED: 'REACTION_LIMIT_REACHED',
  /** Emoji không nằm trong allowlist reaction. */
  REACTION_EMOJI_INVALID: 'REACTION_EMOJI_INVALID',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const knownCodes = new Set<string>(Object.values(ErrorCodes));

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && knownCodes.has(value);
}

/**
 * Mã lỗi suy ra từ HTTP status khi response không mang `code` hợp lệ. Dùng chung cho
 * AllExceptionsFilter (API) và api-client (web, ví dụ proxy trả 502 dạng HTML).
 */
export function errorCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCodes.BAD_REQUEST;
    case 401:
      return ErrorCodes.UNAUTHORIZED;
    case 403:
      return ErrorCodes.FORBIDDEN;
    case 404:
      return ErrorCodes.NOT_FOUND;
    case 409:
      return ErrorCodes.CONFLICT;
    case 429:
      return ErrorCodes.TOO_MANY_REQUESTS;
    case 503:
      return ErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCodes.INTERNAL_ERROR : ErrorCodes.BAD_REQUEST;
  }
}

/** Hình dạng body của mọi response lỗi từ API. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

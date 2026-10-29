/**
 * Danh mục mã lỗi API (quy tắc 14). Mọi response lỗi có `code` thuộc danh mục này;
 * client rẽ nhánh theo `code`, không theo `message` (message có thể đổi câu chữ).
 */
export const ErrorCodes = {
  UPLOAD_INVALID: 'UPLOAD_INVALID',
  UPLOAD_QUOTA_EXCEEDED: 'UPLOAD_QUOTA_EXCEEDED',
  ATTACHMENT_NOT_READY: 'ATTACHMENT_NOT_READY',
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
  /** Channel đã có 50 tin được ghim (TG.3, ADR-0066). */
  PIN_LIMIT_REACHED: 'PIN_LIMIT_REACHED',
  /** Attachment hồ sơ đã được gắn vào avatar/icon trước đó — một tệp chỉ dùng một lần (TG.7). */
  ATTACHMENT_ALREADY_BOUND: 'ATTACHMENT_ALREADY_BOUND',
  /** Server đã có 30 sticker (TG.22, ADR-0067). */
  STICKER_LIMIT_REACHED: 'STICKER_LIMIT_REACHED',
  /** Server đã đạt trần emoji tùy chỉnh (50 tĩnh hoặc 50 động — TG.24, ADR-0068). */
  EMOJI_LIMIT_REACHED: 'EMOJI_LIMIT_REACHED',
  /** Nhà cung cấp GIF thiếu key/lỗi/hết quota — `/gifs/*` 503, chat không ảnh hưởng (TG.25, ADR-0069). */
  GIF_PROVIDER_UNAVAILABLE: 'GIF_PROVIDER_UNAVAILABLE',
  /** Bị chặn hoặc đối phương tắt DM — cùng mã cho cả hai để chống dò nguyên nhân (TG.9, ADR-0070). */
  DM_BLOCKED: 'DM_BLOCKED',
  /** Token xác minh email/đặt lại mật khẩu sai, hết hạn hoặc đã dùng — một mã chung (TG.8). */
  VERIFY_TOKEN_INVALID: 'VERIFY_TOKEN_INVALID',
  /** Tài khoản chưa xác minh email — chặn tạo server/mã mời cho tới khi xác minh (TG.8). */
  VERIFY_REQUIRED: 'VERIFY_REQUIRED',
  /** Đã bị ban khỏi server — join bằng mã mời bị chặn (TG.11). Message không tiết lộ lý do ban. */
  BANNED: 'BANNED',
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

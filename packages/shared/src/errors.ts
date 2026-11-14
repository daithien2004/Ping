/** Client rẽ nhánh theo `code`, không theo `message`. */
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
  REACTION_LIMIT_REACHED: 'REACTION_LIMIT_REACHED',
  REACTION_EMOJI_INVALID: 'REACTION_EMOJI_INVALID',
  PIN_LIMIT_REACHED: 'PIN_LIMIT_REACHED',
  ATTACHMENT_ALREADY_BOUND: 'ATTACHMENT_ALREADY_BOUND',
  STICKER_LIMIT_REACHED: 'STICKER_LIMIT_REACHED',
  EMOJI_LIMIT_REACHED: 'EMOJI_LIMIT_REACHED',
  GIF_PROVIDER_UNAVAILABLE: 'GIF_PROVIDER_UNAVAILABLE',
  /** Dùng chung cho bị chặn và tắt DM để không lộ nguyên nhân. */
  DM_BLOCKED: 'DM_BLOCKED',
  VERIFY_TOKEN_INVALID: 'VERIFY_TOKEN_INVALID',
  VERIFY_REQUIRED: 'VERIFY_REQUIRED',
  BANNED: 'BANNED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const knownCodes = new Set<string>(Object.values(ErrorCodes));

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && knownCodes.has(value);
}

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

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

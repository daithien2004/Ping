import { ErrorCodes, type ErrorCode } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { ApiError } from './api-client';

/** Code có câu chung trong `errors.*` của messages/*.json. */
const KNOWN = [
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.BAD_REQUEST,
  ErrorCodes.UNAUTHORIZED,
  ErrorCodes.FORBIDDEN,
  ErrorCodes.NOT_FOUND,
  ErrorCodes.CONFLICT,
  ErrorCodes.TOO_MANY_REQUESTS,
  ErrorCodes.SERVICE_UNAVAILABLE,
  ErrorCodes.REACTION_LIMIT_REACHED,
  ErrorCodes.REACTION_EMOJI_INVALID,
  ErrorCodes.PIN_LIMIT_REACHED,
] as const;
type KnownCode = (typeof KNOWN)[number];

/** Câu override do nơi gọi đã dịch, theo code ("Không có quyền tạo channel"…). */
export type ErrorOverrides = Partial<Record<ErrorCode, string>>;

export type ErrorDescription =
  | { text: string }
  | { key: KnownCode | 'unknown'; requestId?: string }
  | { key: 'unknownWithId'; requestId: string };

/**
 * Chọn câu báo lỗi theo `ApiError.code` (hợp đồng), không theo `message` của server (hướng dẫn
 * 16.7): câu server là tiếng Anh và có thể đổi. Lỗi không lường trước kèm requestId để báo lại.
 * Hàm thuần (dễ test); `useErrorMessage` lo phần dịch.
 */
export function describeError(error: unknown, overrides: ErrorOverrides = {}): ErrorDescription {
  if (error instanceof ApiError) {
    const override = overrides[error.code];
    if (override) {
      return { text: override };
    }
    const known = KNOWN.find((code) => code === error.code);
    if (known) {
      // Lỗi phía server (5xx) kèm mã để báo lại; lỗi do người dùng (4xx) hay mất kết nối thì không.
      return error.status >= 500 && error.requestId
        ? { key: known, requestId: error.requestId }
        : { key: known };
    }
    if (error.requestId) {
      return { key: 'unknownWithId', requestId: error.requestId };
    }
  }
  return { key: 'unknown' };
}

/** `const errorMessage = useErrorMessage(); errorMessage(error, { FORBIDDEN: t('…') })`. */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return (error: unknown, overrides?: ErrorOverrides): string => {
    const described = describeError(error, overrides);
    if ('text' in described) return described.text;
    if (described.key === 'unknownWithId') {
      return t('unknownWithId', { requestId: described.requestId });
    }
    if (described.requestId) {
      return t('withReference', { message: t(described.key), requestId: described.requestId });
    }
    return t(described.key);
  };
}

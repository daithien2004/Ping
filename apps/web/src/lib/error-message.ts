import { ErrorCodes, type ErrorCode } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { ApiError } from './api-client';

const KNOWN = [
  ErrorCodes.UPLOAD_INVALID,
  ErrorCodes.UPLOAD_QUOTA_EXCEEDED,
  ErrorCodes.ATTACHMENT_NOT_READY,
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
  ErrorCodes.STICKER_LIMIT_REACHED,
  ErrorCodes.EMOJI_LIMIT_REACHED,
  // TG.9: bị chặn hoặc đối phương tắt DM — API cố ý dùng chung một mã chống dò (ADR-0070).
  ErrorCodes.DM_BLOCKED,
  ErrorCodes.VERIFY_TOKEN_INVALID,
  ErrorCodes.VERIFY_REQUIRED,
] as const;
type KnownCode = (typeof KNOWN)[number];

export type ErrorOverrides = Partial<Record<ErrorCode, string>>;

export type ErrorDescription =
  | { text: string }
  | { key: KnownCode | 'unknown'; requestId?: string }
  | { key: 'unknownWithId'; requestId: string };

export function describeError(error: unknown, overrides: ErrorOverrides = {}): ErrorDescription {
  if (error instanceof ApiError) {
    const override = overrides[error.code];
    if (override) {
      return { text: override };
    }
    const known = KNOWN.find((code) => code === error.code);
    if (known) {
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

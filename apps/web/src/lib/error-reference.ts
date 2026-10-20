import { ApiError } from './api-client';

/**
 * Mã để người dùng báo lại khi gặp lỗi: `requestId` của API (khớp log backend, hướng dẫn 15.1.1) hoặc
 * `digest` mà Next gắn vào lỗi ném trên server. undefined nếu không có gì đáng trích dẫn.
 */
export function errorReference(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    return error.requestId;
  }
  const digest = (error as { digest?: unknown } | null | undefined)?.digest;
  return typeof digest === 'string' ? digest : undefined;
}

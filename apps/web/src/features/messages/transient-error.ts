import { ApiError } from '@/lib/api-client';

/** Lỗi mạng (status 0) hoặc lỗi server (5xx): yêu cầu có thể đã được xử lý mà ta không nhận được kết quả. */
export const isTransientError = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);

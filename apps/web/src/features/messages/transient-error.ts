import { ApiError } from '@/lib/api-client';

export const isTransientError = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);

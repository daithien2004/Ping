import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/**
 * Chỉ thử lại lỗi mạng/5xx, tối đa 2 lần. 4xx — gồm 429 — không thử lại: hàng đợi trong
 * `api-client` đã tạm dừng đúng `Retry-After` (ADR-0078), retry ngay chỉ bắn thêm request
 * vào cửa sổ đang bị khóa.
 */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500);
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Dữ liệu ít đổi ngoài realtime (server, channel, quyền): dùng lại 30s rồi mới refetch.
        // Tin nhắn mới đến qua socket và được ghi thẳng vào cache, không chờ refetch.
        staleTime: 30_000,
        retry: shouldRetryRequest,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Mẫu từ tài liệu Next 16 (client-side-data-fetching/tanstack-query.md): mỗi lần render
 * trên server tạo client mới (không rò dữ liệu giữa các request), trình duyệt dùng chung một
 * client để cache sống qua các lần render và chuyển trang.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

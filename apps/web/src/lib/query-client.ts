import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Dữ liệu ít đổi ngoài realtime (server, channel, quyền): dùng lại 30s rồi mới refetch.
        // Tin nhắn mới đến qua socket và được ghi thẳng vào cache, không chờ refetch.
        staleTime: 30_000,
        // Lỗi 4xx (403, 404, 400...) thử lại cũng vậy; chỉ retry lỗi mạng/5xx, tối đa 2 lần.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
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

import { QueryClient } from '@tanstack/react-query';
import { ApiError, restoreSession } from './api-client';
import { qk } from './query-keys';
import {
  clearPersistedQueries,
  hydratePersistedQueries,
  startPersistingQueries,
} from './query-persist';

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
        staleTime: 30_000,
        // Như Discord: quay lại tab không tải lại gì. Mọi dữ liệu đều có đường cập nhật realtime
        refetchOnWindowFocus: false,
        retry: shouldRetryRequest,
      },
    },
  });
}

/**
 * Đăng xuất / phiên hết hạn: xóa mọi query trừ `me` (AuthGate còn theo dõi nó để biết đã đăng
 * xuất) và cả bản lưu localStorage — người tiếp theo trên cùng trình duyệt không được thấy dữ
 * liệu của người trước.
 *
 * Chỉ gọi khi cây `(app)` đã unmount (effect của AuthGate, hoặc onSuccess của login/register):
 * `removeQueries` trên query còn observer khiến observer tạo lại query và refetch ngay. Lúc đó
 * access token đã bị `logout()` xóa, request nhận 401, lần refresh cũng 401 theo (cookie đã thu
 * hồi) — và lỗi nằm lại cache. Phiên đăng nhập sau mount lên sẽ ném đúng lỗi đó qua Suspense.
 */
export function clearSessionQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== qk.me[0] });
  clearPersistedQueries();
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
    const signedIn = hydratePersistedQueries(browserQueryClient);
    startPersistingQueries(browserQueryClient);
    // Lỗi mạng/429 để request đi tiếp như cũ — không chặn app vì một lần khôi phục hỏng.
    if (signedIn) void restoreSession().catch(() => undefined);
  }
  return browserQueryClient;
}

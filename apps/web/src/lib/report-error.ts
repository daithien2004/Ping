import { captureBrowserError } from './sentry';

/**
 * Điểm DUY NHẤT báo lỗi runtime của web ra ngoài (hướng dẫn 16.8). Các trang lỗi (error.tsx,
 * global-error.tsx) gọi hàm này; ghi console và, khi bật Sentry (NEXT_PUBLIC_SENTRY_DSN, ADR-0031),
 * gửi lỗi kèm mã tham chiếu.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  console.error('[ping]', error, context);
  captureBrowserError(error, context);
}

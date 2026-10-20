/**
 * Điểm DUY NHẤT báo lỗi runtime của web ra ngoài (hướng dẫn 16.8). Các trang lỗi (error.tsx,
 * global-error.tsx) gọi hàm này; khi có Sentry (bước quan sát) chỉ cần gắn vào đây, không phải sửa
 * từng trang. Hiện chỉ ghi console.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  console.error('[ping]', error, context);
}

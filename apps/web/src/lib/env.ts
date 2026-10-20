import { z } from 'zod';

/**
 * Biến môi trường của web, validate một lần khi module được nạp (fail fast như API).
 *
 * Next chỉ đưa vào bundle trình duyệt những biến có tiền tố NEXT_PUBLIC_, và chỉ khi được
 * đọc bằng đúng cú pháp `process.env.TEN_BIEN` (Next thay chuỗi lúc build). Vì vậy không
 * truyền cả `process.env` cho zod mà liệt kê từng biến.
 *
 * Next đọc file .env trong apps/web (không phải .env ở gốc repo): xem apps/web/.env.example.
 */
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  // Trống = tắt Sentry hoàn toàn (ADR-0031).
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess((value) => value || undefined, z.url().optional()),
});

export const env = envSchema.parse({
  // Dev chạy được ngay không cần file .env; bản production thiếu biến này thì parse lỗi.
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4000'),
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

/** Gốc của REST API (prefix /api/v1 cố định phía server). */
export const apiBaseUrl = `${env.NEXT_PUBLIC_API_URL}/api/v1`;

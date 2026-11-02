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
  // Mặc định bật; build với 'false' để ẩn lối chọn skin Pixel (ADR-0076). Là hằng build-time,
  // không phải cờ runtime.
  NEXT_PUBLIC_ENABLE_PIXEL_SKIN: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
});

export const env = envSchema.parse({
  // Dev chạy được ngay không cần file .env; bản production thiếu biến này thì parse lỗi.
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4000'),
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_ENABLE_PIXEL_SKIN: process.env.NEXT_PUBLIC_ENABLE_PIXEL_SKIN,
});

/** Gốc của REST API (prefix /api/v1 cố định phía server). */
export const apiBaseUrl = `${env.NEXT_PUBLIC_API_URL}/api/v1`;

/**
 * True khi build production. Next thay sẵn `process.env.NODE_ENV` lúc build nên chỉ có
 * `lib/env.ts` được đọc biến môi trường (lint chặn `process.env` ở nơi khác).
 */
export const isProduction = process.env.NODE_ENV === 'production';

import { z } from 'zod';

/**
 * Every environment variable the API needs, validated once at boot.
 * A missing or malformed variable crashes the process immediately
 * instead of surfacing as a runtime error mid-request (fail fast).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Chỉ cần MỘT secret: access token là JWT. Refresh token là chuỗi ngẫu nhiên
  // opaque (không ký) nên không có secret riêng — hash SHA-256 lưu trong Session.
  JWT_ACCESS_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url(),
  // Số proxy (load balancer) đứng trước API. 0 khi chạy trực tiếp; sau một LB đặt 1 để
  // req.ip là IP thật của client — rate limit theo IP phụ thuộc vào giá trị này.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

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
  // Giới hạn thời gian cho lời gọi hạ tầng (ADR-0026): không request nào được treo vô hạn.
  // Postgres: áp cho statement_timeout (phía server) và query_timeout (phía client pg).
  PG_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  // S��` k���t n��`i t��?i �`a trong pool c��a `pg` cho m��Tt instance API (ADR-0033/T1.1).
  // Ngân sA�ch: instance A- pool <= max_connections c��a Postgres + d��� phA�ng; m��cc �`��<nh 10.
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Redis: mỗi lệnh. Ngắn vì Redis chỉ giữ cache/rate limit/presence, chậm hơn mức này thì
  // bỏ qua (fail-open) còn rẻ hơn chờ.
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(50).default(1_000),
  // Tắt êm khi nhận SIGTERM (ADR-0026). GRACE: thời gian `/ready` đã trả 503 nhưng server vẫn nhận
  // request, để load balancer kịp loại instance (production nên ≥ 2 lần chu kỳ health check của LB;
  // dev để 0). TIMEOUT: trần cho cả quá trình tắt, quá hạn thì buộc thoát (< terminationGracePeriod).
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(25_000),
  // Cổng riêng cho GET /metrics (ADR-0031). Bỏ trống = không mở cổng metrics. Chỉ cho mạng nội bộ.
  METRICS_PORT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  // Sentry (ADR-0031). Bỏ trống = tắt hẳn, không gửi gì, không khởi tạo SDK.
  SENTRY_DSN: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
});

export type Env = z.infer<typeof envSchema>;

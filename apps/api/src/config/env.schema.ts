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
  // Cửa sổ gộp presence (ms) (ADR-0039, T1.2). 0 = phát ngay (không gộp).
  PRESENCE_BATCH_MS: z.coerce.number().int().min(0).max(5_000).default(1_000),
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
  // AI (ADR-0046): embedding chạy cục bộ bằng ONNX, LLM qua Groq free tier.
  // Model ONNX đa ngữ nhỏ; đổi tên model là phải re-embed toàn bộ (lưu modelVersion).
  EMBEDDING_MODEL: z.string().min(1).default('Xenova/multilingual-e5-small'),
  // Qdrant local (ADR-0046/T5.2). Bỏ trống = tính năng vector tắt.
  QDRANT_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  // Groq (ADR-0059). Bỏ trống = AI tắt; mọi lời gọi ném AiUnavailableError.
  GROQ_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
  // T5.7/ADR-0047: hạn mức AI theo ngày (UTC). `AI_DAILY_REQUEST_LIMIT` là số request/user/ngày.
  // `AI_DAILY_BUDGET_USD = 0` tắt kill-switch ngân sách; > 0 là trần chi phí toàn hệ thống/ngày.
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(10_000).default(50),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).max(1_000).default(1),
  // Giá để quy đổi token → USD. Free tier Groq = 0; đặt > 0 khi đổi sang provider trả phí.
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  // Cache câu trả lời theo (server, channel, khoảng tin, model, câu hỏi). 0 = tắt cache.
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(3_600),
  // Timeout mỗi lần gọi LLM + số lần thử lại có giới hạn (chỉ 429/5xx/lỗi mạng).
  AI_LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
  AI_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  AI_LLM_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).max(5_000).default(300),
  // Indexer T5.3: cửa sổ hội thoại + giới hạn token ước lượng cho mỗi chunk.
  AI_CHUNK_WINDOW: z.coerce.number().int().min(1).max(20).default(4),
  AI_CHUNK_MAX_TOKENS: z.coerce.number().int().min(64).max(2048).default(512),
  // Tắt consumer khi cần (test tự động luôn tắt qua NODE_ENV=test).
  AI_INDEXER_ENABLED: z.preprocess(
    (value) => (value === undefined || value === '' ? true : value !== 'false'),
    z.boolean(),
  ),
  // Entry pending lâu hơn ngưỡng này được consumer mới nhận lại (consumer chết giữa chừng).
  AI_INDEXER_CLAIM_IDLE_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

import { z } from 'zod';

export const envSchema = z.object({
  ATTACHMENT_STORAGE_DIR: z.string().min(1).default('../../.uploads'),
  ATTACHMENT_USER_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),
  ATTACHMENT_SERVER_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024 * 1024),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Chỉ một secret: refresh token là chuỗi opaque ngẫu nhiên (hash SHA-256 lưu trong Session), không ký.
  JWT_ACCESS_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url(),
  // Số proxy đứng trước API (0 = trực tiếp); sai giá trị thì req.ip và rate limit theo IP sai.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  PG_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  // instance × pool <= max_connections của Postgres + dự phòng.
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Cửa sổ gộp presence (ms); 0 = phát ngay.
  PRESENCE_BATCH_MS: z.coerce.number().int().min(0).max(5_000).default(1_000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(50).default(1_000),
  // GRACE (ms): /ready đã 503 nhưng vẫn nhận request để LB kịp loại instance; TIMEOUT: trần tắt, quá hạn thì buộc thoát.
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(25_000),
  // Cổng riêng cho /metrics; bỏ trống = không mở. Chỉ cho mạng nội bộ.
  METRICS_PORT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  // Bỏ trống = Sentry tắt hẳn.
  SENTRY_DSN: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  // Đổi model embedding là phải re-embed toàn bộ (lưu modelVersion).
  // .env.example để trống nên chuỗi rỗng phải quy về undefined trước khi default.
  EMBEDDING_MODEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).default('Xenova/multilingual-e5-small'),
  ),
  // Bỏ trống = vector tắt.
  QDRANT_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  // Bỏ trống = AI tắt.
  GROQ_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
  // Bỏ trống = tìm GIF tắt (503 GIF_PROVIDER_UNAVAILABLE).
  TENOR_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Bỏ trống = ConsoleMailer chỉ ghi log. Không log nội dung thư (chứa token một lần).
  SMTP_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  // AI_DAILY_BUDGET_USD = 0 tắt kill-switch ngân sách; hạn mức theo ngày UTC.
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(10_000).default(50),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).max(1_000).default(1),
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  // 0 = tắt cache câu trả lời.
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(3_600),
  AI_LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
  AI_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  AI_LLM_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).max(5_000).default(300),
  AI_CHUNK_WINDOW: z.coerce.number().int().min(1).max(20).default(4),
  AI_CHUNK_MAX_TOKENS: z.coerce.number().int().min(64).max(2048).default(512),
  AI_INDEXER_ENABLED: z.preprocess(
    (value) => (value === undefined || value === '' ? true : value !== 'false'),
    z.boolean(),
  ),
  AI_INDEXER_CLAIM_IDLE_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

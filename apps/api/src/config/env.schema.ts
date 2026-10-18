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
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url(),
});

export type Env = z.infer<typeof envSchema>;

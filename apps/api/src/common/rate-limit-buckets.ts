// ttl / blockDuration tính bằng MILISECONDS (guard dịch sang giây khi ghi header).
export const RATE_LIMIT_BUCKETS = {
  readLight: { limit: 240, ttl: 60_000, blockDuration: 3_000 },
  history: { limit: 120, ttl: 60_000, blockDuration: 2_000 },
  search: { limit: 40, ttl: 60_000, blockDuration: 10_000 },
  writeMessage: { limit: 60, ttl: 10_000, blockDuration: 3_000 },
  writeStructure: { limit: 20, ttl: 60_000, blockDuration: 10_000 },
  uploads: { limit: 30, ttl: 60_000, blockDuration: 5_000 },
  attachmentRead: { limit: 600, ttl: 60_000, blockDuration: 2_000 },
  authCredential: { limit: 10, ttl: 60_000, blockDuration: 60_000 },
  authRegister: { limit: 5, ttl: 60_000, blockDuration: 60_000 },
  authSession: { limit: 30, ttl: 60_000, blockDuration: 5_000 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS;

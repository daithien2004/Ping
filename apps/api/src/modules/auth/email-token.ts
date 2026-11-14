import { createHash, randomBytes } from 'node:crypto';

// DB chỉ giữ băm SHA-256 (rò DB không lộ token còn hiệu lực); token thô chỉ tồn tại trong thư.

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface NewEmailToken {
  raw: string;
  tokenHash: string;
}

export function newEmailToken(): NewEmailToken {
  const raw = randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashEmailToken(raw) };
}

export function hashEmailToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface EmailTokenRow {
  expiresAt: Date;
  usedAt: Date | null;
}

export function emailTokenUsable(
  row: EmailTokenRow | null | undefined,
  now: Date = new Date(),
): boolean {
  return row !== null && row !== undefined && row.usedAt === null && row.expiresAt > now;
}

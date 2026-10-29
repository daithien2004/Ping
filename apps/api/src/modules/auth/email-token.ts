import { createHash, randomBytes } from 'node:crypto';

/**
 * Token một lần cho xác minh email / đặt lại mật khẩu (TG.8). Token thô chỉ tồn tại
 * trong thư; DB chỉ giữ băm SHA-256 — rò rỉ DB không lộ token còn hiệu lực (cùng lý do
 * với refresh token: chuỗi ngẫu nhiên 256-bit không brute-force được nên SHA-256 đủ,
 * khác mật khẩu người dùng thấp entropy — mới cần argon2id).
 */

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface NewEmailToken {
  /** Chuỗi đưa vào link trong thư — chỉ xuất hiện một lần này. */
  raw: string;
  /** SHA-256 của token thô — giá trị duy nhất được lưu DB. */
  tokenHash: string;
}

export function newEmailToken(): NewEmailToken {
  const raw = randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashEmailToken(raw) };
}

export function hashEmailToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Hàng token tra theo băm. */
export interface EmailTokenRow {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Token còn dùng được không? Sai/hết hạn/đã dùng đều là MỘT kết quả — API trả cùng mã
 * VERIFY_TOKEN_INVALID cho cả ba, không tiết lộ token từng tồn tại hay đã dùng.
 */
export function emailTokenUsable(
  row: EmailTokenRow | null | undefined,
  now: Date = new Date(),
): boolean {
  return row !== null && row !== undefined && row.usedAt === null && row.expiresAt > now;
}

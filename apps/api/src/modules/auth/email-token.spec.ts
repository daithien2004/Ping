import { describe, expect, it } from 'vitest';
import { emailTokenUsable, hashEmailToken, newEmailToken } from './email-token.js';

describe('token một lần cho xác minh/đặt lại mật khẩu (TG.8)', () => {
  it('token thô và băm khác nhau; băm ổn định theo token', () => {
    const { raw, tokenHash } = newEmailToken();
    expect(raw).not.toBe(tokenHash);
    expect(tokenHash).toBe(hashEmailToken(raw));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('hai token sinh ra không trùng nhau', () => {
    expect(newEmailToken().raw).not.toBe(newEmailToken().raw);
  });

  it('emailTokenUsable: chỉ token chưa dùng còn hạn mới usable — sai/hết hạn/đã dùng là MỘT kết quả', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const usable = (overrides: Partial<{ usedAt: Date | null; expiresAt: Date }> = {}) => ({
      expiresAt: new Date('2026-01-15T13:00:00Z'),
      usedAt: null,
      ...overrides,
    });

    expect(emailTokenUsable(usable(), now)).toBe(true);
    // Đã dùng → không usable, dù còn hạn.
    expect(emailTokenUsable(usable({ usedAt: new Date('2026-01-15T11:00:00Z') }), now)).toBe(false);
    // Hết hạn → không usable, dù chưa dùng.
    expect(emailTokenUsable(usable({ expiresAt: new Date('2026-01-15T11:59:59Z') }), now)).toBe(
      false,
    );
    // Không có hàng (token không tồn tại) → không usable.
    expect(emailTokenUsable(null, now)).toBe(false);
    expect(emailTokenUsable(undefined, now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth';

describe('account lifecycle contracts (TG.8)', () => {
  it('token ngắn hơn 10 ký tự bị chặn (token thật dài, chống đoán)', () => {
    expect(verifyEmailSchema.safeParse({ token: 'a'.repeat(43) }).success).toBe(true);
    expect(verifyEmailSchema.safeParse({ token: 'ngan' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'ngan', password: 'matkhau-dai' }).success).toBe(
      false,
    );
  });

  it('mật khẩu mới tối thiểu 8 ký tự như register', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'a'.repeat(43), password: '7kytu!' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'a'.repeat(43), password: 'mat-khau-moi-123' })
        .success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', password: 'mat-khau-moi-123' })
        .success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', password: 'mat-khau-moi-123' }).success,
    ).toBe(false);
  });

  it('email chuẩn hóa lowercase + đúng định dạng', () => {
    const parsed = forgotPasswordSchema.parse({ email: '  Alice@Ping.DEV ' });
    expect(parsed.email).toBe('alice@ping.dev');
    expect(forgotPasswordSchema.safeParse({ email: 'khong-phai-email' }).success).toBe(false);
  });
});

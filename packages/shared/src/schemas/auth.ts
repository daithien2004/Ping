import { z } from 'zod';

// Email không phân biệt hoa/thường: chuẩn hóa TRƯỚC khi validate (zod 4 chạy
// .trim() sau check định dạng nếu viết z.email().trim()).
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  email: emailSchema,
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_.-]+$/i, 'chỉ dùng chữ, số, _ . -'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** User trả về cho client (không bao giờ có passwordHash). Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  /** TG.8: chưa xác minh email thì bị chặn tạo server/mã mời (chính sách lightweight). */
  emailVerified: boolean;
}

/** Response của POST /auth/register và /auth/login. Refresh token đi riêng qua cookie httpOnly. */
export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

/**
 * TG.8 — vòng đời tài khoản. Email xác minh/đặt lại mật khẩu đi qua cổng Mailer (Mailpit ở
 * dev); token lưu BĂM một lần với TTL ngắn, phản hồi API giống nhau dù email tồn tại hay không
 * (chống dò tài khoản). Refresh token có hàng Session trong DB → liệt kê/thu hồi được.
 */

/** Xác minh email bằng token trong thư. */
export const verifyEmailSchema = z.object({ token: z.string().min(10).max(128) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Gửi thư đặt lại mật khẩu — response luôn 202 bất kể email có tồn tại. */
export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Đặt lại mật khẩu bằng token trong thư; đặt lại xong thu hồi MỌI phiên. */
export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(128),
  password: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Đổi mật khẩu khi đăng nhập: biết mật khẩu hiện tại; các phiên KHÁC bị thu hồi. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Một phiên đăng nhập (refresh token có hàng trong DB) — thiết bị tóm tắt từ User-Agent. */
export interface SessionDto {
  id: string;
  device: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface SessionsResponse {
  sessions: SessionDto[];
}

/** Gửi lại thư xác minh email (rate limit theo email + IP ở API). */
export const resendVerificationSchema = z.object({ email: emailSchema });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

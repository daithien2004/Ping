import { z } from 'zod';

// Chuẩn hóa email TRƯỚC khi validate (zod 4 chạy .trim() sau check định dạng).
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

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(128) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Response luôn 202 bất kể email có tồn tại. */
export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(128),
  password: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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

export const resendVerificationSchema = z.object({ email: emailSchema });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

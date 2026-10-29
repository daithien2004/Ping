import {
  changePasswordSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthResponse,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type SessionDto,
  type SessionsResponse,
  type VerifyEmailInput,
} from '@ping/shared';
import { z } from 'zod';
import { api, getAccessToken, refreshAccessToken, setAccessToken } from '@/lib/api-client';

/**
 * Người dùng hiện tại, hoặc null nếu chưa đăng nhập. Sau F5 token trong RAM đã mất: thử đổi
 * cookie refresh (httpOnly) lấy token mới trước, rồi mới gọi /users/me.
 */
export async function getSession(): Promise<PublicUser | null> {
  if (!getAccessToken() && !(await refreshAccessToken())) {
    return null;
  }
  return api.get<PublicUser>('/users/me');
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const { user, accessToken } = await api.post<AuthResponse>('/auth/login', input);
  setAccessToken(accessToken);
  return user;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const { user, accessToken } = await api.post<AuthResponse>('/auth/register', input);
  setAccessToken(accessToken);
  return user;
}

/** Thu hồi session ở server (xóa cookie). Lỗi mạng vẫn phải đăng xuất phía client. */
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Không chặn đăng xuất: token trong RAM vẫn bị xóa; cookie còn lại sẽ hết hạn.
  } finally {
    setAccessToken(null);
  }
}

/* TG.8 — vòng đời tài khoản: mọi hàm parse input bằng schema shared (cùng luật với API) và
   trả void: response 202/204 hoặc body rỗng không mang gì client cần dùng. */

/** POST /auth/verify-email — token một lần lấy từ thư xác minh. */
export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  await api.post('/auth/verify-email', verifyEmailSchema.parse(input));
}

/** POST /auth/password/forgot — luôn 202, không lộ email có tồn tại (chống dò tài khoản). */
export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  await api.post('/auth/password/forgot', forgotPasswordSchema.parse(input));
}

/** POST /auth/password/reset — đặt lại bằng token trong thư; server thu hồi mọi phiên. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  await api.post('/auth/password/reset', resetPasswordSchema.parse(input));
}

/** POST /auth/verify-email/resend — gửi lại thư xác minh (rate limit theo email + IP). */
export async function resendVerification(input: ResendVerificationInput): Promise<void> {
  await api.post('/auth/verify-email/resend', resendVerificationSchema.parse(input));
}

/** PATCH /users/me/password — biết mật khẩu hiện tại; server thu hồi các phiên KHÁC. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.patch('/users/me/password', changePasswordSchema.parse(input));
}

// Shape trả về của API được parse zod tại biên như hướng dẫn 12.2 (mẫu của settings/api.ts):
// SessionDto là interface của shared — web không định nghĩa lại ngữ nghĩa, chỉ dựng validator.
const sessionDtoSchema: z.ZodType<SessionDto> = z.object({
  id: z.string(),
  device: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  current: z.boolean(),
});

const sessionsResponseSchema: z.ZodType<SessionsResponse> = z.object({
  sessions: z.array(sessionDtoSchema),
});

/** GET /users/me/sessions — phiên của chính người gọi; `current` đánh dấu phiên đang gọi. */
export async function listSessions(): Promise<SessionDto[]> {
  const response = await api.get<SessionsResponse>('/users/me/sessions', sessionsResponseSchema);
  return response.sessions;
}

/** DELETE /users/me/sessions/:sessionId — thu hồi một phiên khác (không thể tự thu hồi). */
export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/users/me/sessions/${sessionId}`);
}

/** DELETE /users/me/sessions — thu hồi TẤT CẢ phiên khác của người gọi. */
export async function revokeOtherSessions(): Promise<void> {
  await api.delete('/users/me/sessions');
}

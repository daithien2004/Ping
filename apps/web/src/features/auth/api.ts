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

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    /* bỏ qua */
  } finally {
    setAccessToken(null);
  }
}

export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  await api.post('/auth/verify-email', verifyEmailSchema.parse(input));
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  await api.post('/auth/password/forgot', forgotPasswordSchema.parse(input));
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  await api.post('/auth/password/reset', resetPasswordSchema.parse(input));
}

export async function resendVerification(input: ResendVerificationInput): Promise<void> {
  await api.post('/auth/verify-email/resend', resendVerificationSchema.parse(input));
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.patch('/users/me/password', changePasswordSchema.parse(input));
}

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

export async function listSessions(): Promise<SessionDto[]> {
  const response = await api.get<SessionsResponse>('/users/me/sessions', sessionsResponseSchema);
  return response.sessions;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/users/me/sessions/${sessionId}`);
}

export async function revokeOtherSessions(): Promise<void> {
  await api.delete('/users/me/sessions');
}

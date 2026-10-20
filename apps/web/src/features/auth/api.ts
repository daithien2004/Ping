import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@ping/shared';
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

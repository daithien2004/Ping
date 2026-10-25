// POST /auth/login tối đa 10 lần/phút/IP (cố ý, chống dò mật khẩu). Bộ e2e chạy nối tiếp trong một
// process nên đếm ở đây được: chờ khi đã dùng đủ 6 lần trong 60 giây (chừa chỗ cho global-setup và
// các spec đăng nhập bằng API).
import type { APIRequestContext } from '@playwright/test';
import type { AuthResponse } from '@ping/shared';

const WINDOW_MS = 60_000;
const BUDGET = 6;
const recent: number[] = [];

export async function paceLogin() {
  const now = Date.now();
  while (recent.length && now - recent[0]! >= WINDOW_MS) recent.shift();
  if (recent.length >= BUDGET) {
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - recent[0]!)));
    recent.shift();
  }
  recent.push(Date.now());
}

const API_BASE = 'http://localhost:4000/api/v1';

/**
 * Đăng nhập qua API có pacing — MỌI spec phải dùng helper này thay vì gọi /auth/login trực
 * tiếp: cụm spec cuối bộ e2e dồn nhiều login trong một cửa sổ 60 giây sẽ 429 (đã gặp trên
 * CI: 4 spec cuối đỏ vì login không pacing).
 */
export async function pacedLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthResponse> {
  await paceLogin();
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`pacedLogin ${email} → HTTP ${response.status()}`);
  }
  return (await response.json()) as AuthResponse;
}

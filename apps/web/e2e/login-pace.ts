// POST /auth/login tối đa 10 lần/phút/IP: chờ khi đã dùng 6 lần trong 60 giây (chừa chỗ cho global-setup và spec đăng nhập bằng API).
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

/** Mọi spec phải dùng helper này thay vì gọi /auth/login trực tiếp, không thì 429 ở cuối bộ. */
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

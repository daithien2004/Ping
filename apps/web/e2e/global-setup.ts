import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AuthResponse, ChannelDto, ServerDetail } from '@ping/shared';

export const API = 'http://localhost:4000/api/v1';
const HEALTH = 'http://localhost:4000/api/v1/health';
// apps/web là CommonJS: Playwright biên dịch file này sang CJS nên có __dirname, không có import.meta.
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Chờ API sẵn sàng trước khi seed. API chạy ở chế độ watch nên có thể đang khởi động lại
 * (sửa mã nguồn → nest watch restart) lúc bắt đầu run; không chờ thì test fail với lỗi mạng
 * khó hiểu thay vì thông báo rõ ràng.
 */
async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'chưa phản hồi';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `API chưa sẵn sàng tại ${HEALTH} (${lastError}). Hãy bật API (pnpm --filter api dev) rồi chạy lại.`,
  );
}

/**
 * Dữ liệu riêng cho mỗi lần chạy (không đụng dữ liệu dev): một user mới, một server, channel
 * #long có 300 tin. Truyền cho test qua process.env (Playwright chuyển env của globalSetup sang
 * worker).
 */
export default async function globalSetup() {
  await waitForApi();

  const id = randomUUID().slice(0, 8);
  const email = `e2e-${id}@example.test`;
  const password = 'e2e-password';

  const auth = await post<AuthResponse>('/auth/register', {
    email,
    username: `e2e_${id}`,
    password,
  });
  const token = auth.accessToken;
  const server = await post<ServerDetail>('/servers', { name: `E2E ${id}` }, token);
  const channel = await post<ChannelDto>(`/servers/${server.id}/channels`, { name: 'long' }, token);

  // Ghi thẳng DB bằng script dev: gửi 300 tin qua API sẽ chạm rate limit.
  process.loadEnvFile(path.join(repoRoot, '.env'));
  // shell: Windows chạy pnpm qua pnpm.cmd. Hai id do server sinh (UUID) nên ghép chuỗi an toàn.
  const seed = spawnSync(
    `pnpm --filter api exec tsx prisma/seed-messages.ts ${channel.id} ${auth.user.id} 300`,
    { cwd: repoRoot, stdio: 'inherit', shell: true },
  );
  if (seed.status !== 0) {
    throw new Error('seed-messages failed');
  }

  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_SERVER_ID = server.id;
  process.env.E2E_CHANNEL_ID = channel.id;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} → ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

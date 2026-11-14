import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AuthResponse, ChannelDto, ServerDetail } from '@ping/shared';

export const API = 'http://localhost:4000/api/v1';
const HEALTH = 'http://localhost:4000/api/v1/health';
const MAILPIT = 'http://127.0.0.1:8025/api/v1';
const repoRoot = path.resolve(__dirname, '../../..');

/** Mỗi run Playwright bật API mới (compile nguội rồi listen): chờ API sẵn sàng trước khi seed. */
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
  await ensureVerifiedForSeed(email, token);
  const server = await post<ServerDetail>('/servers', { name: `E2E ${id}` }, token);
  const channel = await post<ChannelDto>(`/servers/${server.id}/channels`, { name: 'long' }, token);

  // Ghi thẳng DB: gửi 300 tin qua API sẽ chạm rate limit.
  process.loadEnvFile(path.join(repoRoot, '.env'));
  // shell: Windows chạy pnpm qua pnpm.cmd.
  const seed = spawnSync(
    `pnpm --filter api exec tsx prisma/seed-messages.ts ${channel.id} ${auth.user.id} 300`,
    { cwd: repoRoot, stdio: 'inherit', shell: true },
  );
  if (seed.status !== 0) {
    throw new Error('seed-messages failed');
  }

  // Seed có thể khởi động lại API: chờ API nghe cổng lại để khỏi ECONNREFUSED.
  await waitForApi(60_000);

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

async function postNoBody(path: string, body: unknown): Promise<boolean> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.ok;
}

export async function ensureUserVerified(email: string): Promise<void> {
  if (await verifyEmailFromMailpit(email)) return;
  verifyUserInDb(email);
}

/** Fallback khi API dev không có SMTP_URL (ConsoleMailer, Mailpit không có thư): đặt emailVerified thẳng DB. */
async function ensureVerifiedForSeed(email: string, token: string): Promise<void> {
  const me = await fetch(`${API}/users/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (me.ok && ((await me.json()) as { emailVerified?: boolean }).emailVerified === true) {
    return;
  }
  await ensureUserVerified(email);
}

function verifyUserInDb(email: string): void {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'));
  } catch {
    // Không có .env (CI truyền env qua biến).
  }
  // shell: Windows chạy pnpm qua pnpm.cmd.
  const script = spawnSync(`pnpm --filter api exec tsx scripts/verify-user.ts ${email}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (script.status !== 0) {
    throw new Error('verify-user failed — không xác minh được user seed cho e2e');
  }
}

async function verifyEmailFromMailpit(email: string): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const mailToken = await findMailToken(email, '/verify');
    if (mailToken) {
      if (await postNoBody('/auth/verify-email', { token: mailToken })) {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.warn(
    `[web-e2e] không lấy được thư xác minh Mailpit cho ${email} — dùng fallback ghi cờ DB (verify-user).`,
  );
  return false;
}

/** Chọn thư mới nhất khớp: token dùng một lần, thư cũ của run trước không dùng lại được. */
export async function findMailToken(
  email: string,
  path: '/verify' | '/reset-password',
  sinceMs?: number,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${MAILPIT}/messages`);
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      messages?: { ID: string; To?: { Address?: string }[]; Created?: string }[];
    };
    const candidates = (body.messages ?? [])
      .filter(
        (item) =>
          (item.To ?? []).some((to) => to.Address === email) &&
          (sinceMs === undefined || Date.parse(item.Created ?? '') >= sinceMs - 5_000),
      )
      .sort((a, b) => Date.parse(b.Created ?? '') - Date.parse(a.Created ?? ''));
    for (const item of candidates) {
      const detail = (await (await fetch(`${MAILPIT}/message/${item.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const mailToken =
        detail.Text?.match(new RegExp(`${path}\\?token=([A-Za-z0-9._-]+)`))?.[1] ??
        detail.HTML?.match(new RegExp(`${path}\\?token=([A-Za-z0-9._-]+)`))?.[1];
      if (mailToken) return mailToken;
    }
  } catch {
    /* bỏ qua */
  }
  return undefined;
}

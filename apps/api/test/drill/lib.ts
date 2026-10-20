/** Dùng chung cho các drill (diễn tập thật): chạy API đã build, gọi HTTP, bật/tắt container. */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const repoRoot = path.resolve(apiDir, '../..');
process.loadEnvFile(path.join(repoRoot, '.env'));

const PORT = 4100;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const results: Array<{ step: string; ok: boolean }> = [];

export function record(step: string, ok: boolean, detail = ''): void {
  results.push({ step, ok });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${step}${detail ? `  (${detail})` : ''}`);
}

export async function call(
  method: string,
  route: string,
  options: { token?: string; body?: unknown } = {},
) {
  const started = Date.now();
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    ms: Date.now() - started,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

export async function waitFor(
  what: string,
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`  (hết ${timeoutMs}ms chờ: ${what})`);
  return false;
}

export const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], { cwd: repoRoot, stdio: 'pipe' });

export interface RunningApi {
  child: ChildProcess;
  logs: () => string;
  exited: () => boolean;
}

/** Chạy `dist/main.js` ở cổng 4100, Redis DB 2 (không đụng dữ liệu dev ở DB 0). */
export function startApi(): RunningApi {
  if (!existsSync(path.join(apiDir, 'dist/main.js'))) {
    throw new Error('Chưa build API: chạy `pnpm --filter api build` trước.');
  }
  const redisBase = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '');
  let logs = '';
  let exited = false;
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      REDIS_URL: `${redisBase}/2`,
      SHUTDOWN_GRACE_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => (logs += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (logs += chunk.toString()));
  child.on('exit', () => (exited = true));
  return { child, logs: () => logs, exited: () => exited };
}

/** Đăng ký user + server + channel; trả về dữ liệu để gửi tin. */
export async function seedChat() {
  const suffix = Date.now().toString(36);
  const email = `drill-${suffix}@ping.dev`;
  const registered = await call('POST', '/auth/register', {
    body: { email, username: `drill${suffix}`.slice(0, 32), password: 'password123' },
  });
  const token = registered.body.accessToken as string;
  const server = await call('POST', '/servers', { token, body: { name: `drill ${suffix}` } });
  const channels = await call('GET', `/servers/${server.body.id}/channels`, { token });
  const channelId = (channels.body as unknown as Array<{ id: string }>)[0]!.id;
  const send = (content: string) =>
    call('POST', `/channels/${channelId}/messages`, {
      token,
      body: { content, nonce: crypto.randomUUID() },
    });
  return { email, token, channelId, send };
}

/** In tổng kết và thoát với mã 0 nếu mọi bước đạt. */
export function finish(): never {
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} bước đạt`);
  process.exit(failed.length === 0 ? 0 : 1);
}

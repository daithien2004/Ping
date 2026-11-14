#!/usr/bin/env node
/**
 * Tạo tokens cho k6 từ API thật (production): đăng ký load01..load30 rồi join server demo.
 * Chạy: PING_URL=https://20.193.75.48 INVITE_CODE=... LOADTEST_PASSWORD=... node scripts/loadtest-prod-tokens.mjs
 * Không in mật khẩu hay token; tokens.json đã nằm trong tools/loadtest/data/ (gitignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PING_URL = (process.env.PING_URL || '').replace(/\/+$/, '');
const INVITE_CODE = process.env.INVITE_CODE || '';
const PASSWORD = process.env.LOADTEST_PASSWORD || '';
const COUNT = Number(process.env.COUNT || 30);
const START = Number(process.env.START || 1);
const DELAY_MS = Number(process.env.DELAY_MS || 13_000);

if (!PING_URL || !INVITE_CODE || !PASSWORD) {
  console.error('Cần PING_URL, INVITE_CODE và LOADTEST_PASSWORD.');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, { token, body, method = 'GET' } = {}) {
  const response = await fetch(`${PING_URL}/api/v1${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function register(index) {
  const username = `load${String(index).padStart(2, '0')}`;
  const body = {
    email: `${username}@example.com`,
    username,
    password: PASSWORD,
    displayName: `Load ${username.slice(-2)}`,
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await api('/auth/register', { method: 'POST', body });
    if (result.status === 201) return result.data;
    if (result.status === 429) {
      console.log(`${username}: bị giới hạn đăng ký, chờ 65 giây (lần ${attempt}/3)`);
      await sleep(65_000);
      continue;
    }
    if (result.status === 409) {
      throw new Error(`${username}: email/username đã tồn tại — dùng START khác hoặc bỏ qua.`);
    }
    throw new Error(`${username}: HTTP ${result.status} ${JSON.stringify(result.data)}`);
  }
  throw new Error(`${username}: vẫn bị 429 sau 3 lần thử.`);
}

const tokens = [];
for (let i = START; i < START + COUNT; i += 1) {
  const user = await register(i);
  tokens.push({ userId: user.user.id, username: user.user.username, token: user.accessToken });
  console.log(`đăng ký ${user.user.username} + token (${tokens.length}/${COUNT})`);
  if (i < START + COUNT - 1) await sleep(DELAY_MS);
}

const owner = tokens[0];
for (const entry of tokens) {
  const result = await api('/servers/join', {
    method: 'POST',
    token: entry.token,
    body: { inviteCode: INVITE_CODE },
  });
  if (result.status !== 201 && result.status !== 200 && result.status !== 409) {
    throw new Error(`${entry.username}: join HTTP ${result.status} ${JSON.stringify(result.data)}`);
  }
}

const servers = await api('/servers', { token: owner.token });
if (servers.status !== 200 || !Array.isArray(servers.data) || servers.data.length === 0) {
  throw new Error(`Không đọc được server sau khi join: HTTP ${servers.status}`);
}
const server = servers.data[0];
const channels = await api(`/servers/${server.id}/channels`, { token: owner.token });
if (channels.status !== 200 || !Array.isArray(channels.data) || channels.data.length === 0) {
  throw new Error(`Không đọc được channel: HTTP ${channels.status}`);
}
const hot = channels.data.find((channel) => channel.name === 'general') ?? channels.data[0];

const outDir = path.join(repoRoot, 'tools/loadtest/data');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(tokens));
writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify(
    {
      serverId: server.id,
      channels: channels.data.map((channel) => ({ id: channel.id, messages: 0 })),
      hotChannelId: hot.id,
      users: tokens.length,
      messages: 0,
    },
    null,
    2,
  ),
);
console.log(
  `xong: ${tokens.length} user, server "${server.name}", ${channels.data.length} channel, hot "${hot.name}"`,
);

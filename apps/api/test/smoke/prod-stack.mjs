// Kiểm tra khói trên stack production dựng bằng docker-compose.prod.example.yml (ADR-0035):
// đăng ký → tạo server → nối socket QUA reverse proxy → gửi tin → nhận event realtime → presence.
// Dùng:  BASE_URL=http://localhost:8080 node test/smoke/prod-stack.mjs   (thoát 0 nếu đạt)
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const origin = new URL(BASE).origin;
if (process.env.HTTP_URL) {
  const redirect = await fetch(`${process.env.HTTP_URL}/login`, {
    redirect: 'manual',
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), `${origin}/login`);
}
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const call = async (path, init = {}, token) => {
  const response = await fetch(BASE + path, {
    signal: globalThis.AbortSignal.timeout(15_000),
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  return { status: response.status, body: await response.json().catch(() => null), response };
};

const web = await fetch(`${BASE}/login`, { signal: globalThis.AbortSignal.timeout(15_000) });
if (web.status !== 200) fail(`web /login returned ${web.status}`);
if (!web.headers.get('content-security-policy')) fail('web response has no CSP');

// Proxy không được cắt /api hay làm mất hợp đồng lỗi và mã requestId hợp lệ.
const requestId = randomUUID();
const health = await call('/api/v1/health', { headers: { 'x-request-id': requestId } });
assert.equal(health.status, 200);
assert.equal(health.response.headers.get('x-request-id'), requestId);
const invalid = await call('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'invalid', password: 'x' }),
});
assert.equal(invalid.status, 400);
assert.equal(invalid.body.code, 'VALIDATION_ERROR');
assert.equal(invalid.body.requestId, invalid.response.headers.get('x-request-id'));
const large = await call('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'nobody@example.test', password: 'x'.repeat(40_000) }),
});
assert.equal(large.status, 413);
assert.equal(large.body.code, 'BAD_REQUEST');
assert.ok(large.body.requestId);

const suffix = Math.random().toString(36).slice(2, 8);
const registered = await call('/api/v1/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: `smoke-${suffix}@example.test`,
    username: `smoke_${suffix}`,
    password: 'password123',
  }),
});
if (registered.status !== 201) fail(`register returned ${registered.status}`);
if (!(registered.response.headers.get('set-cookie') ?? '').includes('ping_refresh'))
  fail('no refresh cookie');
assert.match(registered.response.headers.get('set-cookie'), /HttpOnly/i);
assert.match(registered.response.headers.get('set-cookie'), /Secure/i);
let token = registered.body.accessToken;
let cookie = registered.response.headers.get('set-cookie').split(';')[0];
const login = await call('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: `smoke-${suffix}@example.test`, password: 'password123' }),
});
assert.equal(login.status, 200);
cookie = login.response.headers.get('set-cookie').split(';')[0];
const denied = await call('/api/v1/auth/refresh', {
  method: 'POST',
  headers: { cookie, origin },
});
assert.equal(denied.status, 403);
const refreshed = await call('/api/v1/auth/refresh', {
  method: 'POST',
  headers: { cookie, origin, 'x-ping-client': 'web' },
});
assert.equal(refreshed.status, 200);
cookie = refreshed.response.headers.get('set-cookie').split(';')[0];
token = refreshed.body.accessToken;

const server = await call(
  '/api/v1/servers',
  { method: 'POST', body: JSON.stringify({ name: 'Smoke' }) },
  token,
);
const channels = await call(`/api/v1/servers/${server.body.id}/channels`, {}, token);
const channelId = channels.body[0].id;

const socket = io(BASE, { transports: ['websocket'], auth: { token } });
const deadline = setTimeout(() => fail('smoke test exceeded 45 seconds'), 45_000);
try {
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => reject(new Error(`socket: ${error.message}`)));
  }).catch((error) => fail(error.message));
  await new Promise((resolve, reject) => {
    socket.timeout(5000).emit('channel.join', { channelId }, (error, ack) => {
      if (error || !ack?.ok) reject(new Error('channel.join was not acknowledged'));
      else resolve();
    });
  });
  const event = new Promise((resolve) => socket.once('message.created', resolve));
  const message = await call(
    `/api/v1/channels/${channelId}/messages`,
    { method: 'POST', body: JSON.stringify({ content: 'smoke', nonce: crypto.randomUUID() }) },
    token,
  );
  if (message.status !== 201) fail(`send message returned ${message.status}`);
  const received = await Promise.race([
    event,
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  if (!received) fail('no realtime message.created event');

  const members = await call(`/api/v1/servers/${server.body.id}/members`, {}, token);
  if (members.body.members[0].online !== true)
    fail('member not reported online while socket is open');
  const logout = await call('/api/v1/auth/logout', {
    method: 'POST',
    headers: { cookie, origin, 'x-ping-client': 'web' },
  });
  assert.equal(logout.status, 204);
  console.log('OK: web, API errors, requestId, refresh/logout, socket ACK, realtime, presence');
} finally {
  socket.disconnect();
  clearTimeout(deadline);
}

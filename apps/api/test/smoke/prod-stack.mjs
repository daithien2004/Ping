// Kiểm tra khói trên stack production dựng bằng docker-compose.prod.example.yml (ADR-0032):
// đăng ký → tạo server → nối socket QUA reverse proxy → gửi tin → nhận event realtime → presence.
// Dùng:  BASE_URL=http://localhost:8080 node test/smoke/prod-stack.mjs   (thoát 0 nếu đạt)
import { io } from 'socket.io-client';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const call = async (path, init = {}, token) => {
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => null), response };
};

const web = await fetch(`${BASE}/login`);
if (web.status !== 200) fail(`web /login returned ${web.status}`);
if (!web.headers.get('content-security-policy')) fail('web response has no CSP');

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
const token = registered.body.accessToken;

const server = await call(
  '/api/v1/servers',
  { method: 'POST', body: JSON.stringify({ name: 'Smoke' }) },
  token,
);
const channels = await call(`/api/v1/servers/${server.body.id}/channels`, {}, token);
const channelId = channels.body[0].id;

const socket = io(BASE, { transports: ['websocket'], auth: { token } });
await new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('connect_error', (error) => reject(new Error(`socket: ${error.message}`)));
}).catch((error) => fail(error.message));
socket.emit('channel.join', { channelId });
const event = new Promise((resolve) => socket.once('message.created', resolve));
await new Promise((resolve) => setTimeout(resolve, 500));
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
socket.disconnect();
console.log('OK: web, auth, socket through proxy, message + realtime event, presence');

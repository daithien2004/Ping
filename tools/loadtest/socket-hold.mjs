// Giữ N socket qua Nginx HTTPS rồi đếm socket bị rớt trong khoảng thời gian cho trước (đo "deploy API có làm rớt socket không", B4).
//   BASE_URL=https://localhost:8443 NODE_EXTRA_CA_CERTS=... N=50 SECONDS=90 node tools/loadtest/socket-hold.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { io } = createRequire(path.join(root, 'apps/api/package.json'))('socket.io-client');
const BASE = process.env.BASE_URL ?? 'https://localhost:8443';
const N = Number(process.env.N ?? 50);
const SECONDS = Number(process.env.SECONDS ?? 90);

const suffix = Date.now().toString(36);
const register = async (i) => {
  const res = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${i >> 8}.${i & 255}` },
    body: JSON.stringify({
      email: `hold-${suffix}-${i}@ping.dev`,
      username: `h${suffix}${i}`.slice(0, 32),
      password: 'password123',
    }),
  });
  if (res.status !== 201) throw new Error(`register ${i}: ${res.status}`);
  return (await res.json()).accessToken;
};

// Đăng ký giới hạn 5 lần/phút theo IP và mỗi người dùng tối đa 10 socket: ceil(N/10) người dùng, cách nhau 13 giây.
const PER_USER = 10;
const tokens = [];
for (let i = 0; i < Math.ceil(N / PER_USER); i++) {
  try {
    tokens.push(await register(i));
  } catch (error) {
    console.error(String(error));
    break;
  }
  await new Promise((r) => setTimeout(r, 13_000));
}
let connected = 0;
let dropped = 0;
const sockets = tokens
  .flatMap((token) => Array.from({ length: PER_USER }, () => token))
  .slice(0, N)
  .map((token) => {
    const socket = io(BASE, { transports: ['websocket'], auth: { token }, reconnection: false });
    socket.on('connect', () => connected++);
    socket.on('disconnect', () => dropped++);
    return socket;
  });
await new Promise((r) => setTimeout(r, 3000));
console.log(JSON.stringify({ phase: 'connected', sockets: sockets.length, connected }));
await new Promise((r) => setTimeout(r, SECONDS * 1000));
console.log(JSON.stringify({ phase: 'done', sockets: sockets.length, connected, dropped }));
sockets.forEach((s) => s.disconnect());
process.exit(0);

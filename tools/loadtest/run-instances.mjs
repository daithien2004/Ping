// Bật N instance API (đã build: `pnpm build`) dùng chung Postgres `ping_load` và Redis, mỗi instance một
// cổng HTTP và một cổng metrics. Không cần load balancer: k6 tự chọn instance theo VU, nên người gửi và
// người nghe nằm ở instance khác nhau (đo độ trễ liên instance).
//
//   node tools/loadtest/run-instances.mjs 3
//   node tools/loadtest/run-instances.mjs 3 --restart-after=60 --restart-index=0   (restart 1 instance giữa tải)
//
// Cổng: HTTP 4001..400N, metrics 9101..910N. Log mỗi instance: tools/loadtest/data/api-<i>.log.
// TRUST_PROXY=1: client gửi X-Forwarded-For riêng từng người dùng ảo, nên rate limit theo IP không chặn
// phép đo (và không phải thêm cờ "tắt rate limit" vào code).
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
process.loadEnvFile(path.join(root, '.env'));

const count = Number(process.argv[2] ?? 1);
const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const restartAfter = Number(flag('restart-after') ?? 0);
const restartIndex = Number(flag('restart-index') ?? 0);

const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.pathname = '/ping_load';
const dataDir = path.join(root, 'tools/loadtest/data');
mkdirSync(dataDir, { recursive: true });

const children = new Map();

function start(index) {
  const log = openSync(path.join(dataDir, `api-${index}.log`), 'a');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.join(root, 'apps/api'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(4001 + index),
      METRICS_PORT: String(9101 + index),
      DATABASE_URL: dbUrl.toString(),
      REDIS_URL: 'redis://localhost:6379/2',
      TRUST_PROXY: '1',
      WEB_ORIGIN: 'http://localhost:3000',
    },
    stdio: ['ignore', log, log],
  });
  children.set(index, child);
  child.on('exit', (code, signal) => console.log(`instance ${index} exited (${signal ?? code})`));
}

async function waitHealthy(index) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${4001 + index}/api/v1/health`);
      if (response.ok) return;
    } catch {
      /* chưa nghe */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`instance ${index} did not become healthy`);
}

for (let i = 0; i < count; i++) start(i);
await Promise.all(Array.from({ length: count }, (_, i) => waitHealthy(i)));
console.log(
  `ready: ${count} instance(s) on http ports ${Array.from({ length: count }, (_, i) => 4001 + i).join(', ')}`,
);

if (restartAfter > 0) {
  setTimeout(async () => {
    console.log(`restarting instance ${restartIndex} (SIGTERM, then start again)`);
    const old = children.get(restartIndex);
    old.kill('SIGTERM');
    await new Promise((resolve) => old.once('exit', resolve));
    start(restartIndex);
    await waitHealthy(restartIndex);
    console.log(`instance ${restartIndex} is back`);
  }, restartAfter * 1000);
}

const stop = () => {
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

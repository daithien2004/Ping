// N container API sau chính cấu hình Nginx production (ops/nginx), dùng Postgres ping_load và Redis DB 2 của compose dev.
// Các container chung network alias `api` nên `server api:4000 resolve;` trả về mọi bản sao, y hệt
// `docker compose up --scale api=N`. Cần: docker build -f apps/api/Dockerfile --target runner -t ping-api:scale .
//   node tools/loadtest/scale-stack.mjs up 3 | roll | kill <index> | status | down
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
process.loadEnvFile(path.join(root, '.env'));

const NETWORK = 'ping-scale';
const PORT = process.env.SCALE_PORT ?? '8081';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const tryDocker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const apiNames = () =>
  docker('ps', '-a', '--filter', 'name=ping-scale-api-', '--format', '{{.Names}}')
    .split('\n')
    .filter(Boolean)
    .sort();

function databaseUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = 'host.docker.internal';
  url.pathname = '/ping_load';
  return url.toString();
}

function startApi(index) {
  const name = `ping-scale-api-${index}`;
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--network',
    NETWORK,
    '--network-alias',
    'api',
    '--stop-timeout',
    '40',
    '-p',
    `${9101 + index}:9100`,
    '-e',
    'NODE_ENV=production',
    '-e',
    'PORT=4000',
    '-e',
    'METRICS_PORT=9100',
    '-e',
    `DATABASE_URL=${databaseUrl()}`,
    '-e',
    'REDIS_URL=redis://host.docker.internal:6379/2',
    '-e',
    `JWT_ACCESS_SECRET=${process.env.JWT_ACCESS_SECRET}`,
    '-e',
    'WEB_ORIGIN=http://localhost:3000',
    '-e',
    'TRUST_PROXY=1',
    '-e',
    'SHUTDOWN_GRACE_MS=10000',
    '-e',
    'SHUTDOWN_TIMEOUT_MS=25000',
    '-e',
    'ATTACHMENT_STORAGE_DIR=/tmp/uploads',
    'ping-api:scale',
  );
  return name;
}

async function waitHealthy(name, tries = 90) {
  for (let i = 0; i < tries; i++) {
    const probe = tryDocker(
      'exec',
      name,
      'node',
      '-e',
      "fetch('http://127.0.0.1:4000/api/v1/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
    );
    if (probe.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} did not become ready`);
}

async function up(count) {
  tryDocker('network', 'create', NETWORK);
  const names = Array.from({ length: count }, (_, i) => startApi(i));
  await Promise.all(names.map((name) => waitHealthy(name)));
  tryDocker('rm', '-f', 'ping-scale-nginx');
  docker(
    'run',
    '-d',
    '--name',
    'ping-scale-nginx',
    '--network',
    NETWORK,
    '-p',
    `${PORT}:80`,
    '-e',
    `PUBLIC_URL=http://localhost:${PORT}`,
    '-e',
    'NGINX_ENVSUBST_FILTER=^PUBLIC_URL$',
    '-v',
    `${path.join(root, 'ops/nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    '-v',
    `${path.join(root, 'ops/nginx')}:/etc/nginx/ping:ro`,
    '-v',
    `${path.join(root, 'ops/nginx/http.conf.template')}:/etc/nginx/templates/default.conf.template:ro`,
    'nginx:1.30.6',
  );
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/v1/health`)).ok) {
        console.log(`ready: ${count} api container(s) behind nginx on :${PORT}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('nginx did not serve /api/v1/health');
}

// Cuốn chiếu như deploy: dừng từng container (SIGTERM, chờ tắt êm), bật lại, chờ ready rồi mới sang cái tiếp theo.
async function roll() {
  for (const name of apiNames()) {
    const started = Date.now();
    console.log(`[${new Date().toISOString()}] stopping ${name}`);
    docker('stop', name);
    docker('start', name);
    await waitHealthy(name);
    console.log(`[${new Date().toISOString()}] ${name} ready after ${Date.now() - started} ms`);
  }
}

// Sập đột ngột: SIGKILL, không grace, không drain. Bật lại sau 3 giây như orchestrator tự khởi động lại.
async function kill(index) {
  const name = `ping-scale-api-${index}`;
  console.log(`[${new Date().toISOString()}] killing ${name} (SIGKILL)`);
  docker('kill', name);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  docker('start', name);
  await waitHealthy(name);
  console.log(`[${new Date().toISOString()}] ${name} ready again`);
}

const [command, arg] = process.argv.slice(2);
if (command === 'up') await up(Number(arg ?? 3));
else if (command === 'roll') await roll();
else if (command === 'kill') await kill(Number(arg ?? 0));
else if (command === 'status')
  console.log(docker('ps', '--filter', 'name=ping-scale', '--format', '{{.Names}} {{.Status}}'));
else if (command === 'down') {
  tryDocker('rm', '-f', 'ping-scale-nginx', ...apiNames());
  tryDocker('network', 'rm', NETWORK);
} else {
  console.log('usage: scale-stack.mjs up <N> | roll | kill <index> | status | down');
}

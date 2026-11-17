// S2: API trên k3s (một node, chạy trong container Docker). Đo rollout không gián đoạn và chết pod.
//   docker run -d --name ping-k3s --privileged ... rancher/k3s (xem README.md), rồi: node experiments/s2-k3s/run.mjs
// Cần image ping-api:scale (tools/loadtest/scale-stack.mjs build) và Postgres/Redis dev đang chạy.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
process.loadEnvFile(path.join(root, '.env'));
const NODE = 'ping-k3s';
const run = (cmd, args, input) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const kubectl = (...a) => run('docker', ['exec', '-i', NODE, 'kubectl', ...a]);
const applyJson = (obj) =>
  run('docker', ['exec', '-i', NODE, 'kubectl', 'apply', '-f', '-'], JSON.stringify(obj));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new URL(process.env.DATABASE_URL);
db.hostname = 'host.docker.internal';
db.pathname = '/ping_demo';

const t0 = Date.now();
execFileSync(
  'bash',
  ['-c', `docker save ping-api:scale | docker exec -i ${NODE} ctr images import -`],
  {
    stdio: 'pipe',
    maxBuffer: 1 << 28,
  },
);
const importMs = Date.now() - t0;

applyJson({
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: { name: 'ping-api' },
  stringData: {
    DATABASE_URL: db.toString(),
    REDIS_URL: 'redis://host.docker.internal:6379/2',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  },
});

const labels = { app: 'ping-api' };
applyJson({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name: 'ping-api' },
  spec: {
    replicas: 2,
    selector: { matchLabels: labels },
    strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
    template: {
      metadata: { labels },
      spec: {
        terminationGracePeriodSeconds: 40,
        containers: [
          {
            name: 'api',
            image: 'ping-api:scale',
            imagePullPolicy: 'Never',
            envFrom: [{ secretRef: { name: 'ping-api' } }],
            env: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'PORT', value: '4000' },
              { name: 'METRICS_PORT', value: '9100' },
              { name: 'WEB_ORIGIN', value: 'http://localhost:3000' },
              { name: 'TRUST_PROXY', value: '1' },
              { name: 'SHUTDOWN_GRACE_MS', value: '10000' },
              { name: 'SHUTDOWN_TIMEOUT_MS', value: '25000' },
              { name: 'ATTACHMENT_STORAGE_DIR', value: '/tmp/uploads' },
            ],
            ports: [{ containerPort: 4000 }],
            readinessProbe: {
              httpGet: { path: '/api/v1/ready', port: 4000 },
              periodSeconds: 2,
              failureThreshold: 2,
            },
            livenessProbe: {
              httpGet: { path: '/api/v1/health', port: 4000 },
              initialDelaySeconds: 30,
              periodSeconds: 10,
            },
            resources: { requests: { memory: '200Mi' }, limits: { memory: '500Mi' } },
          },
        ],
      },
    },
  },
});
applyJson({
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name: 'ping-api' },
  spec: { selector: labels, ports: [{ port: 80, targetPort: 4000 }] },
});

const rolloutStarted = Date.now();
kubectl('rollout', 'status', 'deploy/ping-api', '--timeout=300s');
const firstReadyMs = Date.now() - rolloutStarted;
const ip = kubectl('get', 'svc', 'ping-api', '-o', 'jsonpath={.spec.clusterIP}').trim();

// Bắn request liên tục từ trong node tới ClusterIP trong khi gây nhiễu.
function poll(seconds) {
  const script = `ok=0;bad=0;end=$(( $(date +%s)+${seconds} ));while [ $(date +%s) -lt $end ];do if wget -q -T 2 -O /dev/null http://${ip}/api/v1/ready;then ok=$((ok+1));else bad=$((bad+1));fi;done;echo "$ok $bad"`;
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('docker', ['exec', NODE, 'sh', '-c', script]);
    child.stdout.on('data', (c) => (out += c));
    child.on('close', () => {
      const [ok, bad] = out.trim().split(' ').map(Number);
      resolve({ ok, bad });
    });
  });
}

const result = { importImageMs: importMs, firstReadyMs, replicas: 2 };

// 1. Rollout cuốn chiếu (đổi biến môi trường để sinh ReplicaSet mới)
let polled = poll(75);
await sleep(3000);
const rollStart = Date.now();
kubectl('set', 'env', 'deploy/ping-api', `ROLL=${Date.now()}`);
kubectl('rollout', 'status', 'deploy/ping-api', '--timeout=300s');
result.rolling = { rolloutMs: Date.now() - rollStart, requests: await polled };

// 2. Xóa đột ngột một pod (grace 0 ~ SIGKILL)
await sleep(3000);
polled = poll(45);
await sleep(3000);
const pod = kubectl(
  'get',
  'pods',
  '-l',
  'app=ping-api',
  '-o',
  'jsonpath={.items[0].metadata.name}',
).trim();
const killStart = Date.now();
kubectl('delete', 'pod', pod, '--grace-period=0', '--force');
kubectl('rollout', 'status', 'deploy/ping-api', '--timeout=300s');
let ready = 0;
while (ready < 2 && Date.now() - killStart < 120000) {
  ready = Number(
    kubectl('get', 'deploy', 'ping-api', '-o', 'jsonpath={.status.readyReplicas}') || 0,
  );
  if (ready < 2) await sleep(1000);
}
result.podKill = { backToTwoReadyMs: Date.now() - killStart, requests: await polled };

console.log(JSON.stringify(result, null, 2));

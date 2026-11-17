/**
 * Định tuyến đọc sang replica (ADR-0102): trang tin cũ và tìm kiếm đọc từ replica; trang đầu (đọc-sau-ghi) luôn từ primary;
 * replica chết thì tự rơi về primary mà request vẫn 200, replica sống lại thì quay về.
 * Cần `docker compose up -d postgres postgres-replica` và `pnpm --filter api build`. Không chạy trong `test:e2e`.
 */
import { call, compose, finish, record, seedChat, startApi, waitFor } from './lib.js';

process.env.REPLICA_DATABASE_URL ??= 'postgresql://ping:ping@127.0.0.1:5433/ping';
process.env.METRICS_PORT = '9110';

async function metric(line: RegExp): Promise<number> {
  const text = await fetch('http://127.0.0.1:9110/metrics').then((r) => r.text());
  const match = text.split('\n').find((l) => line.test(l));
  return match ? Number(match.split(' ').at(-1)) : 0;
}
const reads = (target: 'primary' | 'replica') =>
  metric(new RegExp(`^db_reads_total\\{target="${target}"\\}`));
const replicaUp = async () => (await metric(/^dependency_up\{name="postgres_replica"\}/)) === 1;

const api = startApi();
try {
  const ready = await waitFor(
    'API khởi động',
    async () => (await call('GET', '/ready')).body.status === 'ok',
    60_000,
  );
  record('API chạy', ready);
  record('API thấy replica khỏe', await waitFor('replica khỏe', replicaUp, 30_000));

  const { token, channelId, send } = await seedChat();
  for (let i = 0; i < 5; i++) await send(`tin ${i}`);
  const first = await call('GET', `/channels/${channelId}/messages?limit=3`, { token });
  const messages = first.body.messages as { id: string }[];
  const cursor = messages.at(-1)!.id;

  const replicaBefore = await reads('replica');
  const primaryBefore = await reads('primary');
  await call('GET', `/channels/${channelId}/messages?limit=3`, { token });
  record('trang đầu (đọc-sau-ghi) không đi replica', (await reads('replica')) === replicaBefore);
  const older = await call('GET', `/channels/${channelId}/messages?limit=3&before=${cursor}`, {
    token,
  });
  record(
    'trang cũ phía sau con trỏ đọc từ replica và trả đúng dữ liệu',
    older.status === 200 && (await reads('replica')) > replicaBefore,
  );

  console.log('>>> docker compose stop postgres-replica');
  compose('stop', 'postgres-replica');
  const degraded = await waitFor(
    'API nhận ra replica chết',
    async () => !(await replicaUp()),
    20_000,
  );
  record('replica chết → dependency_up postgres_replica = 0', degraded);
  const olderDown = await call('GET', `/channels/${channelId}/messages?limit=3&before=${cursor}`, {
    token,
  });
  record(
    'request vẫn 200 và rơi về primary',
    olderDown.status === 200 && (await reads('primary')) > primaryBefore,
  );

  console.log('>>> docker compose start postgres-replica');
  compose('start', 'postgres-replica');
  record(
    'replica sống lại → API quay về replica',
    await waitFor('replica khỏe lại', replicaUp, 60_000),
  );
} finally {
  try {
    compose('start', 'postgres-replica');
  } catch {
    /* đã chạy */
  }
  api.child.kill();
}
finish();

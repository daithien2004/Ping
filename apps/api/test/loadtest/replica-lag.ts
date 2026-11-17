/**
 * B5: streaming replica đọc. Dựng một cặp Postgres 17 MỚI (primary + replica, không đụng CSDL dev), đo:
 *  1. ghi xong rồi đọc NGAY ở replica có thấy không (đọc cũ), và mất bao lâu để thấy;
 *  2. độ trễ replication (byte và mili giây) khi ghi liên tục ~500 dòng/giây;
 *  3. độ trễ sau một đợt ghi dồn 200.000 dòng.
 *   pnpm --filter api loadtest:replica
 */
import { execFileSync, spawnSync } from 'node:child_process';
import pg from 'pg';

const NET = 'ping-repl';
const PRIMARY = 'ping-repl-primary';
const REPLICA = 'ping-repl-replica';
const VOLUME = 'ping-repl-data';
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const tryDocker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const url = (port: number) => `postgresql://ping:ping@127.0.0.1:${port}/ping`;

async function ready(container: string) {
  for (let i = 0; i < 60; i++) {
    if (tryDocker('exec', container, 'pg_isready', '-U', 'ping').status === 0) return;
    await sleep(1000);
  }
  throw new Error(`${container} not ready`);
}

async function connect(port: number) {
  for (let i = 0; i < 30; i++) {
    const client = new pg.Client({ connectionString: url(port) });
    try {
      await client.connect();
      return client;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`cannot connect to :${port}`);
}

function teardown() {
  tryDocker('rm', '-f', PRIMARY, REPLICA);
  tryDocker('volume', 'rm', VOLUME);
  tryDocker('network', 'rm', NET);
}

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
};

teardown();
try {
  docker('network', 'create', NET);
  docker(
    'run',
    '-d',
    '--name',
    PRIMARY,
    '--network',
    NET,
    '-p',
    '127.0.0.1:5543:5432',
    '-e',
    'POSTGRES_USER=ping',
    '-e',
    'POSTGRES_PASSWORD=ping',
    'postgres:17',
    '-c',
    'wal_level=replica',
    '-c',
    'max_wal_senders=5',
    '-c',
    'listen_addresses=*',
  );
  await ready(PRIMARY);
  docker(
    'exec',
    PRIMARY,
    'bash',
    '-c',
    "echo 'host replication ping all scram-sha-256' >> /var/lib/postgresql/data/pg_hba.conf",
  );
  docker('exec', PRIMARY, 'psql', '-U', 'ping', '-c', 'select pg_reload_conf()');

  docker('volume', 'create', VOLUME);
  docker(
    'run',
    '--rm',
    '--network',
    NET,
    '-v',
    `${VOLUME}:/var/lib/postgresql/data`,
    '-e',
    'PGPASSWORD=ping',
    'postgres:17',
    'bash',
    '-c',
    `pg_basebackup -h ${PRIMARY} -U ping -D /var/lib/postgresql/data -R -X stream -c fast && chown -R postgres:postgres /var/lib/postgresql/data && chmod 700 /var/lib/postgresql/data`,
  );
  docker(
    'run',
    '-d',
    '--name',
    REPLICA,
    '--network',
    NET,
    '-p',
    '127.0.0.1:5544:5432',
    '-v',
    `${VOLUME}:/var/lib/postgresql/data`,
    '-e',
    'POSTGRES_PASSWORD=ping',
    'postgres:17',
    '-c',
    'hot_standby=on',
  );
  await ready(REPLICA);

  const primary = await connect(5543);
  const replica = await connect(5544);
  await primary.query(
    'CREATE TABLE msg (id bigserial PRIMARY KEY, body text NOT NULL, ts timestamptz NOT NULL DEFAULT now())',
  );
  const stream = await primary.query('select state, sync_state from pg_stat_replication');
  for (let i = 0; i < 30; i++) {
    const seen = await replica.query("select to_regclass('public.msg') as t");
    if (seen.rows[0].t) break;
    await sleep(200);
  }

  // 1. đọc cũ: ghi xong rồi hỏi replica NGAY (một lần), và đo thời gian tới khi thấy
  let stale = 0;
  const visible: number[] = [];
  const N = 300;
  for (let i = 0; i < N; i++) {
    const inserted = await primary.query("INSERT INTO msg(body) VALUES ('x') RETURNING id");
    const id = inserted.rows[0].id as string;
    const started = process.hrtime.bigint();
    let first = true;
    for (;;) {
      const hit = await replica.query('SELECT 1 FROM msg WHERE id = $1', [id]);
      if (hit.rowCount === 1) break;
      if (first) stale++;
      first = false;
    }
    visible.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  // 2. ghi liên tục ~500 dòng/giây trong 20 giây, lấy mẫu lag mỗi 200 ms
  const body = 'y'.repeat(200);
  let writing = true;
  const writer = (async () => {
    while (writing) {
      await primary.query('INSERT INTO msg(body) SELECT $1 FROM generate_series(1, 50)', [body]);
      await sleep(100);
    }
  })();
  const bytes: number[] = [];
  const replayMs: number[] = [];
  const stop = Date.now() + 20_000;
  while (Date.now() < stop) {
    const [now, lag] = await Promise.all([
      primary.query('select pg_current_wal_lsn() as lsn'),
      primary.query('select extract(epoch from replay_lag)*1000 as ms from pg_stat_replication'),
    ]);
    const applied = await replica.query('select pg_last_wal_replay_lsn() as lsn');
    const diff = await primary.query('select pg_wal_lsn_diff($1, $2)::bigint as b', [
      now.rows[0].lsn,
      applied.rows[0].lsn,
    ]);
    bytes.push(Number(diff.rows[0].b));
    if (lag.rows[0]?.ms !== null && lag.rows[0]?.ms !== undefined)
      replayMs.push(Number(lag.rows[0].ms));
    await sleep(200);
  }
  writing = false;
  await writer;

  // 3. đợt ghi dồn 200.000 dòng: bao lâu replica mới thấy dòng cuối
  const burstStart = Date.now();
  const last = await primary.query(
    'WITH ins AS (INSERT INTO msg(body) SELECT $1 FROM generate_series(1, 200000) RETURNING id) SELECT max(id) AS id FROM ins',
    [body],
  );
  const lastId = Number(last.rows[0].id);
  const committedMs = Date.now() - burstStart;
  while ((await replica.query('SELECT 1 FROM msg WHERE id = $1', [lastId])).rowCount !== 1)
    await sleep(10);
  const burstVisibleMs = Date.now() - burstStart;

  console.log(
    JSON.stringify(
      {
        replication: stream.rows[0],
        immediateRead: {
          writes: N,
          staleOnFirstRead: stale,
          staleRate: stale / N,
          visibleMs: {
            p50: quantile(visible, 0.5),
            p95: quantile(visible, 0.95),
            max: quantile(visible, 1),
          },
        },
        sustained500PerSec: {
          samples: bytes.length,
          lagBytes: {
            p50: quantile(bytes, 0.5),
            p95: quantile(bytes, 0.95),
            max: quantile(bytes, 1),
          },
          replayLagMs: {
            p50: quantile(replayMs, 0.5),
            p95: quantile(replayMs, 0.95),
            max: quantile(replayMs, 1),
          },
        },
        burst200k: {
          primaryCommittedMs: committedMs,
          visibleOnReplicaMs: burstVisibleMs,
          extraMs: burstVisibleMs - committedMs,
        },
      },
      null,
      2,
    ),
  );
  await primary.end();
  await replica.end();
} finally {
  teardown();
}

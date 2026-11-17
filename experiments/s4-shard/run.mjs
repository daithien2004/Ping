// S4: shard theo serverId trên N CSDL Postgres riêng. Đây là đồ chơi để HIỂU CÁI GIÁ, không phải thiết kế để đưa vào sản phẩm.
//   node experiments/s4-shard/run.mjs        (cần `docker compose up -d`; tạo và xóa các CSDL ping_s4_*)
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
process.loadEnvFile(path.join(root, '.env'));
const { Client, Pool } = createRequire(path.join(root, 'apps/api/package.json'))('pg');

const base = new URL(process.env.DATABASE_URL);
const url = (db) => {
  const u = new URL(base);
  u.pathname = `/${db}`;
  return u.toString();
};
const MAX_SHARDS = 4;
const names = Array.from({ length: MAX_SHARDS }, (_, i) => `ping_s4_${i}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quantile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(q * values.length))];

const DDL = `
  CREATE TABLE users (id uuid PRIMARY KEY, username text NOT NULL UNIQUE);
  CREATE TABLE messages (id uuid PRIMARY KEY, server_id uuid NOT NULL, content text NOT NULL, nonce text);
  CREATE INDEX ON messages (server_id, id DESC);
  CREATE TABLE outbox (id uuid PRIMARY KEY, message_id uuid NOT NULL, published boolean NOT NULL DEFAULT false);`;

// Định tuyến: băm serverId rồi chia dư. Đổi số shard thì nhiều khóa đổi chỗ (xem phần 5).
const shardOf = (serverId, n) => createHash('sha1').update(serverId).digest().readUInt32BE(0) % n;

// Jump consistent hash (Lamping & Veach): thêm shard thứ N chỉ chuyển ~1/N khóa.
function jumpHash(key, buckets) {
  let k = BigInt.asUintN(64, createHash('sha1').update(key).digest().readBigUInt64BE(0));
  let b = -1n;
  let j = 0n;
  while (j < BigInt(buckets)) {
    b = j;
    k = BigInt.asUintN(64, k * 2862933555777941757n + 1n);
    j = BigInt(Math.floor((Number(b) + 1) * (Number(1n << 31n) / Number((k >> 33n) + 1n))));
  }
  return Number(b);
}

const admin = new Client({ connectionString: url('postgres') });
await admin.connect();
for (const name of names) {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
}
const pools = names.map((name) => new Pool({ connectionString: url(name), max: 8 }));
for (const pool of pools) await pool.query(DDL);

const report = {};
try {
  // 1. Giao dịch trong một shard: tin nhắn + outbox cùng transaction vẫn nguyên vẹn (quy tắc 3 và 12 còn đúng trong shard).
  const server = randomUUID();
  const pool = pools[shardOf(server, 2)];
  const c = await pool.connect();
  await c.query('BEGIN');
  const message = randomUUID();
  await c.query('INSERT INTO messages (id, server_id, content, nonce) VALUES ($1,$2,$3,$4)', [
    message,
    server,
    'hi',
    'n1',
  ]);
  await c.query('INSERT INTO outbox (id, message_id) VALUES ($1,$2)', [randomUUID(), message]);
  await c.query('COMMIT');
  c.release();
  report.singleShardTransaction =
    'ok: tin nhắn và outbox cùng một transaction trong shard của server';

  // 2. Thông lượng ghi: cùng tổng số tin, N shard (cùng một máy Postgres, nên đây là trần của máy chứ không phải của sharding).
  const TOTAL = 40_000;
  const serversPool = Array.from({ length: 64 }, () => randomUUID());
  report.writeThroughput = {};
  for (const n of [1, 2, 4]) {
    const started = Date.now();
    await Promise.all(
      Array.from({ length: 16 }, async (_, worker) => {
        for (let i = worker; i < TOTAL; i += 16) {
          const s = serversPool[i % serversPool.length];
          await pools[shardOf(s, n)].query(
            'INSERT INTO messages (id, server_id, content) VALUES ($1,$2,$3)',
            [randomUUID(), s, `m${i}`],
          );
        }
      }),
    );
    const seconds = (Date.now() - started) / 1000;
    report.writeThroughput[`${n}_shard`] = {
      seconds: +seconds.toFixed(2),
      perSec: Math.round(TOTAL / seconds),
    };
    for (const p of pools) await p.query('TRUNCATE messages, outbox');
  }

  // 3. Truy vấn xuyên shard: "tin mới nhất trong mọi server của tôi" phải hỏi MỌI shard rồi gộp.
  for (const p of pools) {
    const rows = serversPool.map((s) => [randomUUID(), s, 'seed']);
    for (const [id, s, content] of rows)
      await p.query('INSERT INTO messages (id, server_id, content) VALUES ($1,$2,$3)', [
        id,
        s,
        content,
      ]);
  }
  const mine = serversPool.slice(0, 24);
  report.crossShardQuery = {};
  for (const n of [1, 2, 4]) {
    const times = [];
    for (let i = 0; i < 200; i++) {
      const started = process.hrtime.bigint();
      const byShard = new Map();
      for (const s of mine) byShard.set(shardOf(s, n), [...(byShard.get(shardOf(s, n)) ?? []), s]);
      const parts = await Promise.all(
        [...byShard].map(([shard, servers]) =>
          pools[shard].query(
            'SELECT DISTINCT ON (server_id) server_id, id FROM messages WHERE server_id = ANY($1) ORDER BY server_id, id DESC',
            [servers],
          ),
        ),
      );
      parts.flatMap((r) => r.rows);
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    report.crossShardQuery[`${n}_shard`] = {
      shardsTouched: n,
      p50ms: +quantile(times, 0.5).toFixed(2),
      p95ms: +quantile(times, 0.95).toFixed(2),
    };
  }

  // 4. Khóa duy nhất toàn cục không còn: cùng username tạo được ở hai shard; giao dịch xuyên shard không có.
  await pools[0].query("INSERT INTO users (id, username) VALUES ($1, 'alice')", [randomUUID()]);
  await pools[1].query("INSERT INTO users (id, username) VALUES ($1, 'alice')", [randomUUID()]);
  report.globalUniqueness =
    'hỏng: username "alice" tồn tại ở cả hai shard (UNIQUE chỉ có tác dụng trong một shard); cần thư mục toàn cục hoặc ghi vào một shard trọng tài';
  const a = await pools[0].connect();
  const b = await pools[1].connect();
  await a.query('BEGIN');
  await b.query('BEGIN');
  await a.query("DELETE FROM users WHERE username = 'alice'");
  await a.query('COMMIT');
  await b.query('ROLLBACK'); // giả lập: shard thứ hai lỗi sau khi shard thứ nhất đã commit
  a.release();
  b.release();
  const left = (
    await Promise.all(
      pools
        .slice(0, 2)
        .map((p) => p.query("SELECT count(*)::int AS n FROM users WHERE username = 'alice'")),
    )
  ).map((r) => r.rows[0].n);
  report.crossShardAtomicity = `hỏng: xóa user ở 2 shard, shard 1 lỗi sau khi shard 0 đã commit => còn lại [${left}] (không có rollback chung); cần saga hoặc outbox cho từng bước`;

  // 5. Đổi số shard: bao nhiêu server phải chuyển chỗ?
  const keys = Array.from({ length: 20_000 }, () => randomUUID());
  const moved = (from, to, f) => keys.filter((k) => f(k, from) !== f(k, to)).length / keys.length;
  report.reshard = {
    moduloHash_2_to_3: +moved(2, 3, shardOf).toFixed(3),
    moduloHash_3_to_4: +moved(3, 4, shardOf).toFixed(3),
    jumpHash_2_to_3: +moved(2, 3, jumpHash).toFixed(3),
    jumpHash_3_to_4: +moved(3, 4, jumpHash).toFixed(3),
  };
} finally {
  for (const p of pools) await p.end();
  for (const name of names) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
console.log(JSON.stringify(report, null, 2));
await sleep(10);

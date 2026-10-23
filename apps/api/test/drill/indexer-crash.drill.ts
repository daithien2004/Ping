/**
 * Drill T5.3: kill consumer giữa chừng, không sót/trùng point.
 *
 * Cách chạy (Postgres dev đã migrate, Qdrant + Redis đang chạy):
 *   pnpm --filter api drill:indexer
 *
 * Kịch bản:
 *  1. Tạo user/server/channel + 40 tin trong Postgres.
 *  2. XADD 40 event `message.created` vào stream:outbox.
 *  3. Chạy worker thật (FakeEmbedder) có trễ sau upsert, kill khi mới ghi ~6 point.
 *  4. Chạy lại worker; entry đã upsert nhưng chưa XACK nằm trong pending và được
 *     XAUTOCLAIM xử lý lại. Upsert theo message id nên không sinh point trùng.
 *  5. So tập id point với tập id tin: thiếu = 0, trùng = 0.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { FakeEmbedder } from '../../src/modules/ai/fake-embedder.js';
import { INDEXER_GROUP, INDEXER_STREAM } from '../../src/modules/ai/indexer/indexer.runner.js';
import { collectionName } from '../../src/modules/ai/vector-schema.js';

config({ path: '../../.env', quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const qdrantUrl = process.env.QDRANT_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !qdrantUrl || !redisUrl) {
  throw new Error('Thiếu DATABASE_URL/QDRANT_URL/REDIS_URL');
}

const MESSAGE_COUNT = 40;
const KILL_AFTER_POINTS = 6;
const CLAIM_IDLE_MS = 1000;
const collection = collectionName(new FakeEmbedder().model, new FakeEmbedder().dimensions);
const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'indexer-worker.fixture.ts');
const tsxCli = join(
  dirname(createRequire(import.meta.url).resolve('tsx/package.json')),
  'dist/cli.mjs',
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const runId = Date.now().toString(36);
let userId = '';
let serverId = '';
let worker: ChildProcess | undefined;

const started = performance.now();

try {
  await resetState();
  const seeded = await seed();
  userId = seeded.userId;
  serverId = seeded.serverId;

  console.log(
    JSON.stringify({ step: 'seeded', messages: seeded.messageIds.length, collection, runId }),
  );

  worker = startWorker('first');
  const pointsBeforeKill = await waitFor(
    () => pointCount(collection),
    (count) => count >= KILL_AFTER_POINTS,
    60_000,
    'worker ghi point đầu tiên',
  );
  await killWorker(worker);
  worker = undefined;

  const pendingAtKill = await pendingCount();
  const pointsAtKill = await pointCount(collection);
  console.log(JSON.stringify({ step: 'killed', pointsBeforeKill, pointsAtKill, pendingAtKill }));

  worker = startWorker('recovery');
  await waitFor(
    async () => ({ points: await pointCount(collection), pending: await pendingCount() }),
    (state) => state.points === MESSAGE_COUNT && state.pending === 0,
    90_000,
    'worker phục hồi hết pending',
  );
  await killWorker(worker);
  worker = undefined;

  const ids = await pointIds(collection);
  const expected = [...seeded.messageIds].sort();
  const actual = [...ids].sort();
  const missing = expected.filter((id) => !actual.includes(id));
  const duplicates = actual.length - new Set(actual).size;
  const extra = actual.filter((id) => !expected.includes(id));

  const result = {
    step: 'result',
    seededMessages: expected.length,
    pointsBeforeKill,
    pendingAtKill,
    pointsAfterRecovery: actual.length,
    missing: missing.length,
    duplicates,
    extra: extra.length,
    idsMatch: missing.length === 0 && duplicates === 0 && extra.length === 0,
    durationMs: Math.round(performance.now() - started),
  };
  console.log(JSON.stringify(result, null, 2));

  if (!result.idsMatch) {
    throw new Error(
      `Drill thất bại: missing=${missing.length} duplicates=${duplicates} extra=${extra.length}`,
    );
  }
} finally {
  if (worker) await killWorker(worker);
  await resetState();
  if (serverId) await prisma.server.delete({ where: { id: serverId } }).catch(() => undefined);
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
  await redis.quit();
}

async function resetState(): Promise<void> {
  await redis.del(INDEXER_STREAM);
  const response = await fetch(`${qdrantUrl}/collections/${collection}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Không xoá được collection: ${response.status}`);
  }
}

async function seed(): Promise<{ userId: string; serverId: string; messageIds: string[] }> {
  const user = await prisma.user.create({
    data: {
      email: `drill-indexer-${runId}@ping.dev`,
      username: `drill-indexer-${runId}`,
      displayName: 'Drill Indexer',
      passwordHash: 'not-a-real-hash',
    },
  });
  const server = await prisma.server.create({
    data: { name: `drill-${runId}`, ownerId: user.id, inviteCode: `drill-${runId}` },
  });
  const channel = await prisma.channel.create({
    data: { serverId: server.id, name: 'general' },
  });

  const messageIds: string[] = [];
  for (let index = 0; index < MESSAGE_COUNT; index += 1) {
    const message = await prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: user.id,
        content: `tin drill số ${index}: nội dung hội thoại để kiểm tra chunk`,
      },
    });
    messageIds.push(message.id);
  }

  for (const id of messageIds) {
    await redis.xadd(
      INDEXER_STREAM,
      '*',
      'id',
      id,
      'type',
      'message.created',
      'aggregateType',
      'Message',
      'payload',
      JSON.stringify({ id, channelId: channel.id }),
    );
  }

  return { userId: user.id, serverId: server.id, messageIds };
}

function startWorker(label: string): ChildProcess {
  const child = spawn(process.execPath, [tsxCli, fixture], {
    cwd: resolve(here, '../..'),
    env: {
      ...process.env,
      INDEXER_CONSUMER: `drill-${label}-${process.pid}-${Date.now()}`,
      INDEXER_CLAIM_IDLE_MS: String(CLAIM_IDLE_MS),
      INDEXER_UPSERT_DELAY_MS: '150',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function killWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
  child.kill('SIGKILL');
  await Promise.race([exited, sleep(5_000)]);
}

async function pointCount(name: string): Promise<number> {
  const response = await fetch(`${qdrantUrl}/collections/${name}/points/count`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exact: true }),
  });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`Qdrant count lỗi: ${response.status}`);
  const body = (await response.json()) as { result?: { count?: number } };
  return body.result?.count ?? 0;
}

async function pointIds(name: string): Promise<string[]> {
  const response = await fetch(`${qdrantUrl}/collections/${name}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1000, with_payload: false, with_vector: false }),
  });
  if (!response.ok) throw new Error(`Qdrant scroll lỗi: ${response.status}`);
  const body = (await response.json()) as { result?: { points?: { id: string }[] } };
  return (body.result?.points ?? []).map((point) => point.id);
}

async function pendingCount(): Promise<number> {
  const summary = (await redis.xpending(INDEXER_STREAM, INDEXER_GROUP)) as unknown as
    [number, ...unknown[]] | null;
  return Number(summary?.[0] ?? 0);
}

async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > deadline) {
      throw new Error(`Timeout chờ ${label}; giá trị cuối: ${JSON.stringify(value)}`);
    }
    await sleep(50);
    value = await read();
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Drill T5.3: metric `consumer_lag` có mặt trên /metrics và > 0 khi stream còn event.
 *
 * Chạy sau `pnpm --filter api build` với Postgres/Redis/Qdrant local:
 *   pnpm --filter api drill:consumer-lag
 *
 * Script khởi động API thật ở cổng riêng, đẩy 40 event `message.created` (trỏ tới
 * tin có thật) vào stream, rồi scrape `/metrics` trong lúc consumer còn xử lý.
 * Không tạo/xoá dữ liệu nghiệp vụ; chỉ đọc id tin và upsert lại vector idempotent.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { INDEXER_STREAM } from '../../src/modules/ai/indexer/indexer.runner.js';

config({ path: '../../.env', quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const qdrantUrl = process.env.QDRANT_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !qdrantUrl || !redisUrl) {
  throw new Error('Thiếu DATABASE_URL/QDRANT_URL/REDIS_URL');
}

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '../..');
const port = 3311;
const metricsPort = 19465;
const baseUrl = `http://127.0.0.1:${metricsPort}`;
const EVENTS = 200;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
let child: ChildProcess | undefined;
let stderr = '';

try {
  await redis.del(INDEXER_STREAM);
  const messages = await prisma.message.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: EVENTS,
    select: { id: true, channelId: true },
  });
  if (messages.length < 40) {
    throw new Error(`Cần ít nhất 40 tin trong DB dev, chỉ có ${messages.length}`);
  }

  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      METRICS_PORT: String(metricsPort),
      QDRANT_URL: qdrantUrl,
      AI_INDEXER_ENABLED: 'true',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4_000);
  });

  await waitFor(async () => (await scrape()) !== undefined, 60_000, 'metrics server sẵn sàng');
  const before = metricValue((await scrape()) ?? '', 'consumer_lag');

  for (const message of messages) {
    await redis.xadd(
      INDEXER_STREAM,
      '*',
      'id',
      message.id,
      'type',
      'message.created',
      'aggregateType',
      'Message',
      'payload',
      JSON.stringify({ id: message.id, channelId: message.channelId }),
    );
  }

  const samples: number[] = [];
  const deadline = Date.now() + 30_000;
  let positiveSeenAt: number | undefined;
  while (Date.now() < deadline) {
    const value = metricValue((await scrape()) ?? '', 'consumer_lag');
    if (value !== undefined) samples.push(value);
    if (value !== undefined && value > 0) positiveSeenAt ??= Date.now();
    // Giữ scrape thêm 2 giây sau lần đầu thấy lag để bằng chứng có dãy giảm dần.
    if (positiveSeenAt !== undefined && Date.now() - positiveSeenAt > 2_000) break;
    await sleep(100);
  }

  const observed = Math.max(0, ...samples);
  const result = {
    step: 'result',
    metric: 'consumer_lag',
    beforeEvents: before ?? null,
    eventsPublished: messages.length,
    observedMax: observed,
    samples: samples.filter((value) => value > 0).slice(0, 20),
    exposed: before !== undefined,
    positiveDuringBacklog: observed > 0,
  };
  console.log(JSON.stringify(result, null, 2));

  if (!result.exposed) throw new Error('GET /metrics không có consumer_lag');
  if (!result.positiveDuringBacklog) {
    throw new Error('consumer_lag không > 0 khi stream còn event');
  }
} catch (error) {
  if (stderr) console.error(stderr);
  throw error;
} finally {
  const runningChild = child;
  if (runningChild && runningChild.exitCode === null) {
    const exited = new Promise<void>((resolveExit) =>
      runningChild.once('exit', () => resolveExit()),
    );
    runningChild.kill('SIGKILL');
    await Promise.race([exited, sleep(5_000)]);
  }
  await redis.del(INDEXER_STREAM).catch(() => undefined);
  await prisma.$disconnect();
  await redis.quit();
}

async function scrape(): Promise<string | undefined> {
  try {
    const response = await fetch(`${baseUrl}/metrics`);
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

function metricValue(body: string, name: string): number | undefined {
  const match = body.match(new RegExp(`^${name} (\\S+)$`, 'm'));
  return match ? Number(match[1]) : undefined;
}

async function waitFor(
  done: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`Timeout chờ ${label}`);
    await sleep(200);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

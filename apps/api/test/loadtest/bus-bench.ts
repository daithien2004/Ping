/**
 * So Redis Stream và Kafka trên đúng luồng outbox → indexer (S1): phát N event tuần tự như relay, consumer là runner thật
 * với handler không làm gì, đo độ trễ từ lúc gọi publish tới lúc handler chạy.
 *   BUS=redis|kafka N=3000 KAFKA_BROKERS=localhost:9092 pnpm --filter api loadtest:bus
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import {
  createKafka,
  parseBrokers,
  type KafkaSettings,
} from '../../src/infra/events/kafka.client.js';
import { KafkaPublisher } from '../../src/infra/events/kafka.publisher.js';
import { IndexerRunner } from '../../src/modules/ai/indexer/indexer.runner.js';
import { KafkaIndexerRunner } from '../../src/modules/ai/indexer/kafka-indexer.runner.js';

process.loadEnvFile(path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)), '.env'));

const bus = process.env.BUS === 'kafka' ? 'kafka' : 'redis';
const N = Number(process.env.N ?? 3000);
const run = randomUUID().slice(0, 8);
const sentAt = new Map<string, number>();
const latencies: number[] = [];
let handled = 0;

const core = {
  handleEvent: async (_type: string, messageId: string) => {
    const started = sentAt.get(messageId);
    if (started !== undefined) latencies.push(Date.now() - started);
    handled++;
  },
};
const quantile = (q: number) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms: number) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await sleep(50);
}

let publishMs = 0;
let totalMs = 0;
let storeBytes: number | string = 'n/a';

if (bus === 'redis') {
  const base = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '');
  const redis = new Redis(`${base}/3`);
  const stream = `stream:bench:${run}`;
  const memory = async () => Number(/used_memory:(\d+)/.exec(await redis.info('memory'))?.[1] ?? 0);
  const before = await memory();
  const runner = new IndexerRunner(redis, core as never, {
    consumer: 'bench',
    stream,
    group: 'bench',
  });
  runner.start();
  await sleep(500);
  const started = Date.now();
  for (let i = 0; i < N; i++) {
    const id = randomUUID();
    sentAt.set(id, Date.now());
    await redis.xadd(
      stream,
      '*',
      'id',
      randomUUID(),
      'type',
      'message.created',
      'aggregateType',
      'message',
      'payload',
      JSON.stringify({ id, channelId: 'c1' }),
    );
  }
  publishMs = Date.now() - started;
  await until(() => handled >= N, 120_000);
  totalMs = Date.now() - started;
  storeBytes = (await memory()) - before;
  await runner.stop();
  await redis.del(stream);
  redis.disconnect();
} else {
  const settings: KafkaSettings = {
    brokers: parseBrokers(process.env.KAFKA_BROKERS ?? 'localhost:9092'),
    clientId: 'ping-bench',
    topic: `ping.outbox.bench.${run}`,
    partitions: 3,
  };
  const kafka = createKafka(settings);
  const publisher = new KafkaPublisher(settings);
  publisher.onModuleInit();
  await until(() => publisher.isUp, 30_000);
  const runner = new KafkaIndexerRunner(kafka, settings, core as never, {
    groupId: `bench-${run}`,
  });
  runner.start();
  await sleep(4000);
  const started = Date.now();
  for (let i = 0; i < N; i++) {
    const id = randomUUID();
    sentAt.set(id, Date.now());
    await publisher.publish({
      id: randomUUID(),
      type: 'message.created',
      aggregateType: 'message',
      payload: { id, channelId: 'c1' },
    });
  }
  publishMs = Date.now() - started;
  await until(() => handled >= N, 120_000);
  totalMs = Date.now() - started;
  await runner.stop();
  await publisher.onApplicationShutdown();
  const admin = kafka.admin();
  await admin.connect();
  await admin.deleteTopics({ topics: [settings.topic] }).catch(() => undefined);
  await admin.disconnect();
}

console.log(
  JSON.stringify({
    bus,
    events: N,
    handled,
    publishMs,
    publishPerSec: Math.round((N / publishMs) * 1000),
    totalMs,
    latencyMs: { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99), max: quantile(1) },
    redisUsedMemoryDeltaBytes: storeBytes,
    bytesPerEvent: typeof storeBytes === 'number' ? Math.round(storeBytes / N) : null,
  }),
);
process.exit(0);

/**
 * Giết (SIGKILL) worker indexer đang xử lý dở một event: event đó không được commit nên consumer khác cùng group
 * phải nhận lại, không mất event nào (at-least-once). Cần `docker compose up -d kafka`. Không chạy trong `test:e2e`.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  createKafka,
  parseBrokers,
  type KafkaSettings,
} from '../../src/infra/events/kafka.client.js';
import { KafkaPublisher } from '../../src/infra/events/kafka.publisher.js';
import { KafkaIndexerRunner } from '../../src/modules/ai/indexer/kafka-indexer.runner.js';
import { apiDir, finish, record, waitFor } from './lib.js';

const brokers = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const topic = `ping.outbox.crash.${Date.now().toString(36)}`;
const group = `crash-${randomUUID().slice(0, 6)}`;
const settings: KafkaSettings = {
  brokers: parseBrokers(brokers),
  clientId: 'ping-drill',
  topic,
  partitions: 1,
};

const publisher = new KafkaPublisher(settings);
publisher.onModuleInit();
await waitFor('publisher', async () => publisher.isUp, 30_000);
const ids = Array.from({ length: 5 }, () => randomUUID());
for (const id of ids) {
  await publisher.publish({
    id: randomUUID(),
    type: 'message.created',
    aggregateType: 'message',
    payload: { id },
  });
}

let out = '';
const child = spawn(
  process.execPath,
  ['--import', 'tsx', path.join(apiDir, 'test/drill/kafka-worker.fixture.ts')],
  {
    cwd: apiDir,
    env: { ...process.env, KAFKA_BROKERS: brokers, KAFKA_TOPIC: topic, GROUP: group },
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
const stuck = await waitFor('worker nhận event rồi treo', async () => /STUCK/.test(out), 60_000);
record('worker nhận event đầu tiên và đang xử lý dở', stuck);
const stuckId = /STUCK message\.created (\S+)/.exec(out)?.[1];

console.log('>>> SIGKILL worker giữa chừng');
child.kill('SIGKILL');
await new Promise((resolve) => setTimeout(resolve, 1000));

const seen = new Set<string>();
const kafka = createKafka(settings);
const second = new KafkaIndexerRunner(
  kafka,
  settings,
  { handleEvent: async (_type: string, messageId: string) => void seen.add(messageId) },
  { groupId: group, fromBeginning: true },
);
second.start();
const started = Date.now();
// Consumer chết đột ngột: group chờ hết sessionTimeout (30 giây) rồi mới giao lại partition.
const all = await waitFor('consumer thứ hai nhận đủ', async () => seen.size === ids.length, 90_000);
record(
  'consumer cùng group nhận lại toàn bộ event, kể cả event bị treo',
  all,
  `${Math.round((Date.now() - started) / 1000)}s`,
);
record('event đang xử lý dở được giao lại', stuckId !== undefined && seen.has(stuckId));
record(
  'không mất event nào',
  ids.every((id) => seen.has(id)),
);

await second.stop();
await publisher.onApplicationShutdown();
const admin = kafka.admin();
await admin.connect();
await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
await admin.disconnect();
finish();

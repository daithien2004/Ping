/**
 * Một request gửi tin nhắn phải tạo MỘT trace nối API → outbox.publish → Kafka → indexer.handle (ADR-0100).
 * Cần `docker compose up -d jaeger kafka minio` và `pnpm --filter api build`. Không chạy trong `test:e2e`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createKafka,
  parseBrokers,
  type KafkaSettings,
} from '../../src/infra/events/kafka.client.js';
import { initTracing } from '../../src/infra/tracing/tracing.js';
import { KafkaIndexerRunner } from '../../src/modules/ai/indexer/kafka-indexer.runner.js';
import { finish, record, seedChat, startApi, waitFor } from './lib.js';

process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
process.env.KAFKA_BROKERS ??= 'localhost:9092';
process.env.KAFKA_TOPIC = `ping.outbox.trace.${Date.now().toString(36)}`;
initTracing('ping-drill-consumer');

const settings: KafkaSettings = {
  brokers: parseBrokers(process.env.KAFKA_BROKERS),
  clientId: 'ping-trace-drill',
  topic: process.env.KAFKA_TOPIC,
  partitions: 3,
};
const handled: string[] = [];
const consumer = new KafkaIndexerRunner(
  createKafka(settings),
  settings,
  { handleEvent: async (_type: string, id: string) => void handled.push(id) },
  { groupId: `trace-${randomUUID().slice(0, 6)}`, fromBeginning: true },
);

const api = startApi();
try {
  const ready = await waitFor(
    'API khởi động',
    async () => (await fetch('http://127.0.0.1:4100/api/v1/ready')).ok,
    60_000,
  );
  record('API chạy với tracing bật', ready);
  consumer.start();
  const { token, channelId } = await seedChat();

  const traceId = randomBytes(16).toString('hex');
  const res = await fetch(`http://127.0.0.1:4100/api/v1/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
    },
    body: JSON.stringify({ content: 'trace me', nonce: randomUUID() }),
  });
  record('gửi tin nhắn kèm traceparent → 201', res.status === 201, `status ${res.status}`);
  if (res.status !== 201) console.log((await res.text()).slice(0, 300));

  const delivered = await waitFor('consumer nhận event', async () => handled.length > 0, 60_000);
  record('consumer Kafka nhận event của tin', delivered);

  type Span = { operationName: string; processID: string };
  let spans: Span[] = [];
  let services: string[] = [];
  const found = await waitFor(
    'Jaeger có đủ span',
    async () => {
      const body = (await fetch(`http://127.0.0.1:16686/api/traces/${traceId}`).then((r) =>
        r.json(),
      )) as { data?: { spans: Span[]; processes: Record<string, { serviceName: string }> }[] };
      const trace = body.data?.[0];
      if (!trace) return false;
      spans = trace.spans;
      services = [...new Set(Object.values(trace.processes).map((p) => p.serviceName))];
      return ['outbox.publish', 'indexer.handle'].every((n) =>
        spans.some((s) => s.operationName === n),
      );
    },
    60_000,
  );
  const names = [...new Set(spans.map((s) => s.operationName))];
  console.log(`  span: ${names.join(', ')}\n  service: ${services.join(', ')}`);
  record(
    'một trace chứa span HTTP, outbox.publish và indexer.handle',
    found && names.some((n) => n.includes('/messages')),
  );
  record('trace đi qua nhiều tiến trình (api, drill-consumer)', services.length >= 2);
} finally {
  await consumer.stop();
  api.child.kill();
}
finish();

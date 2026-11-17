/**
 * Dừng container kafka khi API chạy BUS_DRIVER=kafka: REST vẫn ghi được, event outbox nằm yên (không đốt attempts)
 * và được phát khi Kafka về lại. Cần `docker compose --profile kafka up -d kafka` và `pnpm --filter api build`.
 * Không chạy trong `test:e2e`.
 */
import pg from 'pg';
import { call, compose, finish, record, seedChat, startApi, waitFor } from './lib.js';

process.env.BUS_DRIVER = 'kafka';
process.env.KAFKA_BROKERS ??= 'localhost:9092';
process.env.KAFKA_TOPIC = `ping.outbox.drill.${Date.now().toString(36)}`;
process.env.METRICS_PORT = '9109';

const kafkaUp = async () =>
  /dependency_up{name="kafka"} 1/.test(
    await fetch('http://127.0.0.1:9109/metrics').then((r) => r.text()),
  );

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const since = new Date();

async function outbox() {
  const { rows } = await db.query<{ pending: number; attempts: number }>(
    `SELECT count(*) FILTER (WHERE "publishedAt" IS NULL)::int AS pending,
            COALESCE(max(attempts) FILTER (WHERE "publishedAt" IS NULL), 0)::int AS attempts
     FROM "OutboxEvent" WHERE "createdAt" >= ($1::timestamptz AT TIME ZONE 'UTC') AND type LIKE 'message.%'`,
    [since.toISOString()],
  );
  return rows[0]!;
}

const kafkaCompose = (...args: string[]) => compose('--profile', 'kafka', ...args);

const api = startApi();
try {
  const up = await waitFor(
    'API khởi động',
    async () => (await call('GET', '/ready')).body.status === 'ok',
    30_000,
  );
  record('API chạy, /ready = ok', up);
  if (!up) finish();

  record(
    'API đang dùng Kafka (dependency_up{name="kafka"} = 1)',
    await waitFor('kafka up', kafkaUp, 30_000),
  );

  const { send } = await seedChat();
  record('Gửi tin khi Kafka khỏe', (await send('trước sự cố')).status === 201);
  record(
    'Event được phát vào Kafka khi khỏe (outbox về 0 chờ)',
    await waitFor('outbox rỗng', async () => (await outbox()).pending === 0, 20_000),
  );

  console.log('\n>>> docker compose stop kafka');
  kafkaCompose('stop', 'kafka');
  try {
    let slowest = 0;
    for (let i = 0; i < 5; i++) {
      const sent = await send(`trong sự cố ${i}`);
      slowest = Math.max(slowest, sent.ms);
      record(`Gửi tin ${i} khi Kafka chết → 201`, sent.status === 201, `${sent.ms}ms`);
    }
    record('REST không bị Kafka kéo chậm', slowest < 1500, `chậm nhất ${slowest}ms`);

    // 25 giây: đủ để relay thử nhiều lần nếu nó (sai) coi đường chuyển là còn sống và đốt attempts.
    await new Promise((resolve) => setTimeout(resolve, 25_000));
    const during = await outbox();
    record('Event nằm yên chờ Kafka', during.pending >= 5, `pending=${during.pending}`);
    record(
      'Kafka chết không đốt attempts của event (tối đa 1 lần thử đầu)',
      during.attempts <= 1,
      `attempts lớn nhất=${during.attempts}`,
    );
    record(
      'Tiến trình API vẫn sống, không crash/unhandled',
      !api.exited() && !/unhandled/i.test(api.logs()),
    );
  } finally {
    console.log('\n>>> docker compose start kafka');
    kafkaCompose('start', 'kafka');
  }

  record(
    'Kafka về lại: toàn bộ event được phát mà không restart API',
    await waitFor('outbox rỗng', async () => (await outbox()).pending === 0, 90_000),
  );
} catch (error) {
  record('Drill chạy hết', false, (error as Error).message);
  try {
    kafkaCompose('start', 'kafka');
  } catch {
    // Dọn dẹp tốt nhất có thể: container có thể đã chạy lại.
  }
} finally {
  api.child.kill();
  await db.end();
}
finish();

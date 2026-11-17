import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKafka, parseBrokers, type KafkaSettings } from '../src/infra/events/kafka.client.js';
import { KafkaPublisher } from '../src/infra/events/kafka.publisher.js';
import { KafkaIndexerRunner } from '../src/modules/ai/indexer/kafka-indexer.runner.js';

// Cần broker thật: `docker compose --profile kafka up -d kafka` rồi KAFKA_BROKERS=localhost:9092. Không có thì bỏ qua.
const brokers = process.env.KAFKA_BROKERS;
const TYPES = ['message.created', 'message.updated', 'message.deleted'] as const;

type Call = { type: string; messageId: string; consumer: string; seq: number };

describe.skipIf(!brokers)('kafka outbox bus (e2e, ADR-0094)', () => {
  const settings: KafkaSettings = {
    brokers: parseBrokers(brokers ?? 'localhost:9092'),
    clientId: 'ping-test',
    topic: `ping.outbox.test.${randomUUID().slice(0, 8)}`,
    partitions: 3,
  };
  const kafka = createKafka(settings);
  const publisher = new KafkaPublisher(settings);
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const calls: Call[] = [];
  let seq = 0;
  const runners: KafkaIndexerRunner[] = [];
  const failedOnce = new Set<string>();

  const core = (name: string, failFirstDeleteOf?: string) => ({
    handleEvent: async (type: string, messageId: string) => {
      if (type === 'message.deleted' && messageId === failFirstDeleteOf && !failedOnce.has(name)) {
        failedOnce.add(name);
        throw new Error('embedding backend down');
      }
      calls.push({ type, messageId, consumer: name, seq: seq++ });
    },
  });

  async function until(check: () => boolean | Promise<boolean>, ms = 30_000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('condition not met in time');
  }

  beforeAll(async () => {
    publisher.onModuleInit();
    await until(() => publisher.isUp);
    // Xen kẽ theo loại để các event của cùng một tin nằm xa nhau trong log; thứ tự chỉ đúng nếu cùng khóa cùng partition.
    for (const type of TYPES) {
      for (const id of ids) {
        await publisher.publish({
          id: randomUUID(),
          type,
          aggregateType: 'message',
          payload: { id, channelId: 'c1' },
        });
      }
    }
  }, 60_000);

  afterAll(async () => {
    for (const runner of runners) await runner.stop();
    await publisher.onApplicationShutdown();
    const admin = kafka.admin();
    await admin.connect();
    await admin.deleteTopics({ topics: [settings.topic] }).catch(() => undefined);
    await admin.disconnect();
  }, 60_000);

  it('hai consumer song song vẫn xử lý các event của một tin đúng thứ tự (cùng khóa, cùng partition)', async () => {
    const group = `order-${randomUUID().slice(0, 6)}`;
    const a = new KafkaIndexerRunner(kafka, settings, core('a', ids[0]), { groupId: group });
    const b = new KafkaIndexerRunner(kafka, settings, core('b', ids[0]), { groupId: group });
    runners.push(a, b);
    a.start();
    b.start();

    await until(() => calls.length >= ids.length * TYPES.length);
    for (const id of ids) {
      const mine = calls.filter((call) => call.messageId === id);
      expect(mine.map((call) => call.type)).toEqual([...TYPES]);
      expect(new Set(mine.map((call) => call.consumer)).size).toBe(1);
    }
  }, 60_000);

  it('event mà handler làm lỗi không bị bỏ qua: được xử lý lại rồi mới commit', async () => {
    const failing = calls.filter(
      (call) => call.messageId === ids[0] && call.type === 'message.deleted',
    );
    expect(failing.length).toBeGreaterThanOrEqual(1);
    expect(failedOnce.size).toBeGreaterThanOrEqual(1);
  });

  it('lag về 0 sau khi group xử lý hết', async () => {
    const group = `lag-${randomUUID().slice(0, 6)}`;
    const runner = new KafkaIndexerRunner(kafka, settings, core('lag'), { groupId: group });
    runners.push(runner);
    runner.start();
    await until(
      async () => (await runner.reportLag()) === 0 && calls.some((c) => c.consumer === 'lag'),
    );
  }, 60_000);

  it('group mới replay toàn bộ từ đầu mà không đụng offset của group cũ', async () => {
    const group = `replay-${randomUUID().slice(0, 6)}`;
    const runner = new KafkaIndexerRunner(kafka, settings, core('replay'), {
      groupId: group,
      fromBeginning: true,
    });
    runners.push(runner);
    runner.start();
    await until(
      () => calls.filter((call) => call.consumer === 'replay').length >= ids.length * TYPES.length,
    );
  }, 60_000);
});

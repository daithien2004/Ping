import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EVENT_PUBLISHER, type EventPublisher } from '../src/infra/events/event-publisher.js';
import { createKafka, parseBrokers } from '../src/infra/events/kafka.client.js';
import { KafkaPublisher } from '../src/infra/events/kafka.publisher.js';
import { OutboxRelayService } from '../src/infra/events/outbox-relay.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { bootApp } from './helpers/boot.js';

// ConfigModule chụp env lúc import AppModule: phải đặt trước mọi import. Cần broker thật (docker compose up -d kafka).
const brokers = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const topic = vi.hoisted(() => `ping.outbox.relay.${Math.random().toString(36).slice(2, 8)}`);
vi.hoisted(() => {
  process.env.KAFKA_TOPIC = topic;
});

const AGGREGATE = `kafka-relay-e2e-${Date.now().toString(36)}`;
const TYPES = ['message.created', 'message.updated', 'message.deleted'] as const;

describe('outbox relay → Kafka (e2e, ADR-0094)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids = Array.from({ length: 4 }, () => randomUUID());

  async function waitFor(predicate: () => Promise<boolean> | boolean, ms: number) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`waitFor timed out after ${ms}ms`);
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    const publisher = app.get<EventPublisher>(EVENT_PUBLISHER, { strict: false });
    expect(publisher).toBeInstanceOf(KafkaPublisher);
    await waitFor(() => publisher.isUp, 30_000);
  }, 60_000);

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: AGGREGATE } });
    await app.close();
    const kafka = createKafka({ brokers: parseBrokers(brokers ?? ''), clientId: 'ping-test' });
    const admin = kafka.admin();
    await admin.connect();
    await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
    await admin.disconnect();
  }, 60_000);

  it('phát event outbox vào Kafka: khóa là id tin, mỗi tin giữ đúng thứ tự, và đánh dấu publishedAt', async () => {
    // Xen kẽ theo loại để event của một tin nằm xa nhau trong bảng outbox.
    for (const type of TYPES) {
      for (const id of ids) {
        await prisma.outboxEvent.create({
          data: { aggregateType: AGGREGATE, type, payload: { id } },
        });
      }
    }
    await app.get(OutboxRelayService, { strict: false }).tick();
    await waitFor(
      async () =>
        (await prisma.outboxEvent.count({
          where: { aggregateType: AGGREGATE, publishedAt: null },
        })) === 0,
      20_000,
    );

    const kafka = createKafka({ brokers: parseBrokers(brokers ?? ''), clientId: 'ping-test' });
    const consumer = kafka.consumer({ groupId: `verify-${randomUUID().slice(0, 6)}` });
    const seen: { key: string; type: string }[] = [];
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const body = JSON.parse(message.value?.toString('utf8') ?? '{}') as {
          type: string;
          aggregateType: string;
        };
        if (body.aggregateType === AGGREGATE) {
          seen.push({ key: message.key?.toString('utf8') ?? '', type: body.type });
        }
      },
    });
    try {
      await waitFor(() => seen.length >= ids.length * TYPES.length, 30_000);
    } finally {
      await consumer.disconnect();
    }

    for (const id of ids) {
      expect(seen.filter((entry) => entry.key === id).map((entry) => entry.type)).toEqual([
        ...TYPES,
      ]);
    }
    expect(seen).toHaveLength(ids.length * TYPES.length);
  }, 90_000);
});

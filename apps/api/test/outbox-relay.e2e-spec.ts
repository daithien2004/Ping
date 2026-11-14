import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  OUTBOX_MAX_ATTEMPTS,
  OutboxRelayService,
} from '../src/infra/events/outbox-relay.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

const AGGREGATE = `relay-e2e-${Date.now().toString(36)}`;
const STREAM = 'stream:outbox';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('Outbox relay (e2e)', () => {
  let first: INestApplication;
  let second: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;

  beforeAll(async () => {
    first = await bootApp();
    second = await bootApp();
    prisma = first.get(PrismaService);
    redis = first.get(RedisProvider);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: AGGREGATE } });
    await first.close();
    await second.close();
  });

  it('hai instance API cùng relay 30 event: stream có đúng 30 entry', async () => {
    await waitFor(
      async () =>
        (await prisma.outboxEvent.count({
          where: { publishedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } },
        })) === 0,
      15_000,
    );
    const before = await redis.xlen(STREAM);
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 30 }, () => ({
        aggregateType: AGGREGATE,
        type: 'test.noop',
        payload: {},
      })),
    });

    await Promise.all([
      first.get(OutboxRelayService, { strict: false }).tick(),
      second.get(OutboxRelayService, { strict: false }).tick(),
    ]);
    await waitFor(
      async () =>
        (await prisma.outboxEvent.count({
          where: { aggregateType: AGGREGATE, publishedAt: null },
        })) === 0,
      15_000,
    );

    expect((await redis.xlen(STREAM)) - before).toBe(30);
  });

  it('event có attempts = OUTBOX_MAX_ATTEMPTS không bị phát', async () => {
    const dead = await prisma.outboxEvent.create({
      data: {
        aggregateType: AGGREGATE,
        type: 'test.dead',
        payload: {},
        attempts: OUTBOX_MAX_ATTEMPTS,
      },
    });

    await first.get(OutboxRelayService, { strict: false }).tick();
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    const after = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: dead.id } });
    expect(after.publishedAt).toBeNull();
    expect(after.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });
});

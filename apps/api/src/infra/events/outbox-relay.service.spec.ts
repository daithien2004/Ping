import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTBOX_MAX_ATTEMPTS, OutboxRelayService } from './outbox-relay.service.js';

interface Row {
  id: string;
  aggregateType: string;
  type: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

const row = (over: Partial<Row> = {}): Row => ({
  id: 'e1',
  aggregateType: 'message',
  type: 'message.created',
  payload: { a: 1 },
  attempts: 0,
  createdAt: new Date(Date.now() - 5_000),
  ...over,
});

function setup(options: { isUp: boolean; rows: Row[]; xaddError?: Error }) {
  const update = vi.fn(async (_args: unknown) => ({}));
  const tx = { $queryRaw: vi.fn(async () => options.rows), outboxEvent: { update } };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    outboxEvent: { update, count: vi.fn(async () => 7) },
  };
  const redis = {
    isUp: options.isUp,
    xadd: vi.fn(async () => {
      if (options.xaddError) throw options.xaddError;
      return '1-0';
    }),
  };
  const metrics = {
    outboxPending: { set: vi.fn() },
    outboxLagSeconds: { set: vi.fn() },
    outboxDead: { set: vi.fn() },
  };
  const service = new OutboxRelayService(prisma as never, redis as never, metrics as never);
  return { service, prisma, update, redis, metrics };
}

describe('OutboxRelayService.tick', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Redis down: không đọc batch và không đụng attempts/nextRetryAt', async () => {
    const { service, prisma, update, redis, metrics } = setup({ isUp: false, rows: [row()] });

    await service.tick();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(redis.xadd).not.toHaveBeenCalled();
    expect(metrics.outboxPending.set).toHaveBeenCalledWith(7);
    expect(metrics.outboxDead.set).toHaveBeenCalledWith(7);
  });

  it('XADD lỗi khi Redis up: attempts+1, nextRetryAt trong tương lai, không đặt publishedAt', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, update } = setup({ isUp: true, rows: [row()], xaddError: new Error('boom') });

    await service.tick();

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as unknown as {
      where: { id: string };
      data: { attempts: number; nextRetryAt: Date; publishedAt?: Date };
    };
    expect(arg.where.id).toBe('e1');
    expect(arg.data.attempts).toBe(1);
    expect(arg.data.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    expect(arg.data.publishedAt).toBeUndefined();
  });

  it('XADD thành công: đặt publishedAt và attempts+1', async () => {
    const { service, update, redis } = setup({ isUp: true, rows: [row({ attempts: 2 })] });

    await service.tick();

    expect(redis.xadd).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as unknown as {
      data: { attempts: number; publishedAt: Date };
    };
    expect(arg.data.attempts).toBe(3);
    expect(arg.data.publishedAt).toBeInstanceOf(Date);
  });

  it('chạm OUTBOX_MAX_ATTEMPTS: log error đúng một lần', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = setup({
      isUp: true,
      rows: [row({ attempts: OUTBOX_MAX_ATTEMPTS - 1 })],
      xaddError: new Error('boom'),
    });

    await service.tick();

    expect(error).toHaveBeenCalledTimes(1);
  });
});

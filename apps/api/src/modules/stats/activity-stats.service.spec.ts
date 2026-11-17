import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { RedisProvider } from '../../infra/redis/redis.module.js';
import { ActivityStatsService, statsKey } from './activity-stats.service.js';

const make = (evalResult: number) => {
  const evalFn = vi.fn().mockResolvedValue(evalResult);
  const service = new ActivityStatsService(
    { eval: evalFn } as unknown as RedisProvider,
    { get: () => 'test' } as unknown as ConfigService<never, true>,
  );
  return { service, evalFn };
};

describe('ActivityStatsService (consumer idempotent, ADR-0101)', () => {
  it('đếm message.created theo kênh và ngày UTC, khoá dedupe theo id event', async () => {
    const { service, evalFn } = make(1);
    const counted = await service.countMessageCreated({
      id: 'evt-1',
      type: 'message.created',
      payload: { channelId: 'chan-1', createdAt: '2026-11-17T23:59:59.000Z' },
    });
    expect(counted).toBe(true);
    const args = evalFn.mock.calls[0]!;
    expect(args[2]).toBe('stats:seen:evt-1');
    expect(args[3]).toBe(statsKey('chan-1', '20261117'));
  });

  it('event đã thấy (Lua trả 0) không đếm lần hai', async () => {
    const { service } = make(0);
    expect(
      await service.countMessageCreated({
        id: 'evt-1',
        type: 'message.created',
        payload: { channelId: 'chan-1' },
      }),
    ).toBe(false);
  });

  it('bỏ qua loại event khác và event thiếu channelId mà không chạm Redis', async () => {
    const { service, evalFn } = make(1);
    expect(
      await service.countMessageCreated({ id: 'e', type: 'message.deleted', payload: {} }),
    ).toBe(false);
    expect(
      await service.countMessageCreated({ id: 'e', type: 'message.created', payload: {} }),
    ).toBe(false);
    expect(evalFn).not.toHaveBeenCalled();
  });
});

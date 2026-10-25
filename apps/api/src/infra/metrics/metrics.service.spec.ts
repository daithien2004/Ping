import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisProvider } from '../redis/redis.module.js';
import { MetricsService } from './metrics.service.js';

const services: MetricsService[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(services.splice(0).map((service) => service.onModuleDestroy()));
});

async function setup(budget = 10) {
  const aggregate = vi.fn().mockResolvedValue({ _sum: { costUsd: 8.1 } });
  const prisma = { aiUsage: { aggregate }, $queryRaw: vi.fn().mockResolvedValue([]) };
  const redis = { isUp: true, ping: vi.fn().mockResolvedValue('PONG') };
  const config = new ConfigService({ AI_DAILY_BUDGET_USD: budget }) as ConfigService<Env, true>;
  const service = new MetricsService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisProvider,
    config,
  );
  services.push(service);
  const port = await service.listen(0);
  return {
    service,
    aggregate,
    scrape: async () => (await fetch(`http://127.0.0.1:${port}/metrics`)).text(),
  };
}

describe('AI observability', () => {
  it('reads durable daily spend at scrape time, including the UTC day after midnight', async () => {
    const { aggregate, scrape } = await setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T23:59:59Z'));
    expect(await scrape()).toContain('ai_daily_spent_usd 8.1');
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenLastCalledWith({
      _sum: { costUsd: true },
      where: { day: new Date('2026-10-25T00:00:00Z') },
    });
    vi.setSystemTime(new Date('2026-10-26T00:00:01Z'));
    aggregate.mockResolvedValueOnce({ _sum: { costUsd: null } });
    const text = await scrape();
    expect(text).toContain('ai_daily_spent_usd 0');
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(text).toContain('ai_daily_budget_usd 10');
    expect(text).toContain('ai_budget_metrics_up 1');
    expect(aggregate).toHaveBeenLastCalledWith({
      _sum: { costUsd: true },
      where: { day: new Date('2026-10-26T00:00:00Z') },
    });
  });

  it('does not report stale spend or zero spend as healthy when Postgres fails, and recovers', async () => {
    const { aggregate, scrape } = await setup();
    await scrape();
    aggregate.mockRejectedValueOnce(new Error('database down'));
    const failed = await scrape();
    expect(failed).toMatch(/ai_daily_spent_usd nan/i);
    expect(failed).toContain('ai_budget_metrics_up 0');
    expect(await scrape()).toContain('ai_budget_metrics_up 1');
  });

  it('exports budget zero as disabled and records latency for successful and failed operations without IDs', async () => {
    const { service, scrape } = await setup(0);
    service.aiRequestFinished('cache_hit', 0.2);
    service.aiRequestFinished('unavailable', 0.5);
    service.qdrantCompleted(0.1, 'error');
    service.searchCompleted(0.3, 'ok');
    const text = await scrape();
    expect(text).toContain('ai_daily_budget_usd 0');
    expect(text).toContain('ai_latency_seconds_count{outcome="cache_hit"} 1');
    expect(text).toContain('ai_latency_seconds_count{outcome="unavailable"} 1');
    expect(text).toContain('qdrant_latency_seconds_count{outcome="error"} 1');
    expect(text).toContain('search_latency_seconds_count{outcome="ok"} 1');
    expect(text).not.toMatch(/userId=|serverId=|channelId=|question=/);
  });
});

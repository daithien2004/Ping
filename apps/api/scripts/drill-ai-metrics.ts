import { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env.schema.js';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import type { PrismaService } from '../src/infra/prisma/prisma.service.js';
import type { RedisProvider } from '../src/infra/redis/redis.module.js';

// Synthetic local-only demo; no real users, provider calls, or production cost records.
const config = new ConfigService({ AI_DAILY_BUDGET_USD: 10 }) as ConfigService<Env, true>;
const metrics = new MetricsService(
  {
    aiUsage: { aggregate: async () => ({ _sum: { costUsd: 8.1 } }) },
    $queryRaw: async () => [],
  } as unknown as PrismaService,
  { isUp: true, ping: async () => 'PONG' } as unknown as RedisProvider,
  config,
);
const port = await metrics.listen(19100);
console.log(`SYNTHETIC metrics fixture on ${port}: 8.1 / 10 USD (81%), no real provider calls`);
const timer = setInterval(() => {
  metrics.aiRequestFinished('ok', 0.4);
  metrics.aiRequestFinished('cache_hit', 0.025);
  metrics.aiRequestFinished('unavailable', 0.8);
  metrics.aiLlmCompleted(0.3, { promptTokens: 120, completionTokens: 40 }, 0.0001);
  metrics.qdrantCompleted(0.015, 'ok');
  metrics.searchCompleted(0.02, 'ok');
}, 3_000);
async function close(): Promise<void> {
  clearInterval(timer);
  await metrics.onModuleDestroy();
}
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});

import { Injectable, type OnApplicationShutdown, type OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisProvider } from '../redis/redis.module.js';
import { MetricsService } from '../metrics/metrics.service.js';

const POLL_MS = 500;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    // Drain remaining.
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const pending = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null, nextRetryAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      // Metric: số event chưa phát.
      const pendingCount = await this.prisma.outboxEvent.count({ where: { publishedAt: null } });
      this.metrics.outboxPending.set(pendingCount);
      if (pending.length === 0) return;
      const oldest = pending[0];
      this.metrics.outboxLagSeconds.set((now.getTime() - oldest.createdAt.getTime()) / 1000);

      for (const event of pending) {
        try {
          if (!this.redis.isUp) {
            throw new Error('redis unavailable');
          }
          await this.redis.xadd(
            'stream:outbox',
            '*',
            'id',
            event.id,
            'type',
            event.type,
            'aggregateType',
            event.aggregateType,
            'payload',
            JSON.stringify(event.payload),
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { publishedAt: new Date(), attempts: event.attempts + 1 },
          });
        } catch (error) {
          const attempts = event.attempts + 1;
          const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              nextRetryAt: new Date(Date.now() + backoffMs),
            },
          });
          this.logger.warn(
            { id: event.id, err: (error as Error).message },
            'outbox publish failed',
          );
          if (attempts >= MAX_ATTEMPTS) {
            this.logger.error({ id: event.id }, 'outbox event exceeded max attempts');
          }
        }
      }
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'outbox tick failed');
    } finally {
      this.running = false;
    }
  }
}

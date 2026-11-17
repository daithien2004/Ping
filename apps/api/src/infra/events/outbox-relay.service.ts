import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { EVENT_PUBLISHER, type EventPublisher } from './event-publisher.js';

const POLL_MS = 500;
const BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 10;
// Phát event nằm trong transaction giữ khóa hàng; Prisma mặc định cắt interactive transaction ở 5 s.
const TX_TIMEOUT_MS = 15_000;

interface PendingRow {
  id: string;
  aggregateType: string;
  type: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.tick();
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.updateGauges();
      // Đường chuyển chết (Redis hoặc Kafka) là trạng thái hạ tầng, không phải lỗi của event: để event nằm yên,
      // không đốt attempts (nếu không, một sự cố vài phút sẽ đẩy mọi event qua ngưỡng bỏ cuộc).
      if (!this.publisher.isUp) return;

      await this.prisma.$transaction(
        async (tx) => {
          // Mọi process (API, worker, mỗi instance) đều chạy relay: SKIP LOCKED để hai relay không
          // lấy cùng một hàng, nên không phát trùng.
          const pending = await tx.$queryRaw<PendingRow[]>`
            SELECT id, "aggregateType", type, payload, attempts, "createdAt"
            FROM "OutboxEvent"
            WHERE "publishedAt" IS NULL
              AND "nextRetryAt" <= now()
              AND attempts < ${OUTBOX_MAX_ATTEMPTS}::int
            ORDER BY "createdAt" ASC
            LIMIT ${BATCH_SIZE}::int
            FOR UPDATE SKIP LOCKED`;
          const oldest = pending[0];
          if (!oldest) return;
          this.metrics.outboxLagSeconds.set((Date.now() - oldest.createdAt.getTime()) / 1000);

          for (const event of pending) {
            try {
              await this.publisher.publish(event);
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: { publishedAt: new Date(), attempts: event.attempts + 1 },
              });
            } catch (error) {
              // Đường chuyển vừa chết giữa lô: lỗi hạ tầng, không phải lỗi của event. Không đốt attempts của event này
              // và không thử tiếp phần còn lại (mỗi lần thử có thể tốn cả giây trong lúc giữ khóa hàng).
              if (!this.publisher.isUp) {
                this.logger.warn(
                  { err: (error as Error).message },
                  'outbox transport down, batch left as is',
                );
                return;
              }
              const attempts = event.attempts + 1;
              const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: { attempts, nextRetryAt: new Date(Date.now() + backoffMs) },
              });
              this.logger.warn(
                { id: event.id, err: (error as Error).message },
                'outbox publish failed',
              );
              if (attempts >= OUTBOX_MAX_ATTEMPTS) {
                this.logger.error({ id: event.id }, 'outbox event exceeded max attempts');
              }
            }
          }
        },
        { timeout: TX_TIMEOUT_MS },
      );
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'outbox tick failed');
    } finally {
      this.running = false;
    }
  }

  private async updateGauges(): Promise<void> {
    const [pending, dead] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { publishedAt: null } }),
      this.prisma.outboxEvent.count({
        where: { publishedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } },
      }),
    ]);
    this.metrics.outboxPending.set(pending);
    this.metrics.outboxDead.set(dead);
  }
}

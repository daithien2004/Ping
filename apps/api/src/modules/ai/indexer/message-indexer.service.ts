import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import os from 'node:os';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { MetricsService } from '../../../infra/metrics/metrics.service.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';
import { EMBEDDER, VECTOR_STORE } from '../ai.tokens.js';
import type { Embedder } from '../embedder.port.js';
import type { VectorStore } from '../vector-store.port.js';
import { IndexerRunner } from './indexer.runner.js';
import { MessageIndexerCore } from './message-indexer.core.js';

/**
 * Chạy consumer indexer qua app context (cùng process worker/api).
 * OutboxRelay đã đẩy event vào stream; service này chỉ đọc theo consumer group.
 * Đọc `stream:outbox` nhưng **chỉ xử lý event message** (không ảnh hưởng relay).
 */
@Injectable()
export class MessageIndexerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageIndexerService.name);
  private runner: IndexerRunner | undefined;
  private enabled = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(VECTOR_STORE) private readonly store: VectorStore,
    private readonly metrics: MetricsService,
    config: ConfigService<Env, true>,
  ) {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    this.enabled =
      nodeEnv !== 'test' &&
      config.get('AI_INDEXER_ENABLED', { infer: true }) &&
      Boolean(config.get('QDRANT_URL', { infer: true }));

    if (!this.enabled) {
      return;
    }

    const core = new MessageIndexerCore(this.prisma, this.embedder, this.store, {
      windowSize: config.get('AI_CHUNK_WINDOW', { infer: true }),
      maxTokens: config.get('AI_CHUNK_MAX_TOKENS', { infer: true }),
    });
    this.runner = new IndexerRunner(this.redis, core, {
      consumer: `${os.hostname()}-${process.pid}`,
      claimIdleMs: config.get('AI_INDEXER_CLAIM_IDLE_MS', { infer: true }),
      onLag: (lag) => this.metrics.consumerLag.set(Math.max(0, lag)),
      onError: (error, context) =>
        this.logger.warn({ err: (error as Error).message, context }, 'indexer error'),
    });
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('consumer indexer tắt (test hoặc thiếu QDRANT_URL/AI_INDEXER_ENABLED)');
      return;
    }
    if (!this.redis.isUp) {
      this.logger.warn('Redis chưa sẵn sàng; consumer indexer sẽ retry trong vòng lặp');
    }
    this.runner?.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.runner?.stop();
  }
}

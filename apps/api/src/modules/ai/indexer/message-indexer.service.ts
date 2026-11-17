import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { createKafka, kafkaSettings } from '../../../infra/events/kafka.client.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { MetricsService } from '../../../infra/metrics/metrics.service.js';
import { EMBEDDER, VECTOR_STORE } from '../ai.tokens.js';
import type { Embedder } from '../embedder.port.js';
import type { VectorStore } from '../vector-store.port.js';
import type { IndexerLoop } from './indexer-event.js';
import { KafkaIndexerRunner } from './kafka-indexer.runner.js';
import { MessageIndexerCore } from './message-indexer.core.js';

@Injectable()
export class MessageIndexerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageIndexerService.name);
  private runner: IndexerLoop | undefined;
  private enabled = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
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
    const onLag = (lag: number) => this.metrics.consumerLag.set(Math.max(0, lag));
    const onError = (error: unknown, context: string) =>
      this.logger.warn({ err: (error as Error).message, context }, 'indexer error');
    const settings = kafkaSettings(config);
    this.runner = new KafkaIndexerRunner(createKafka(settings), settings, core, { onLag, onError });
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('consumer indexer tắt (test hoặc thiếu QDRANT_URL/AI_INDEXER_ENABLED)');
      return;
    }
    this.runner?.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.runner?.stop();
  }
}

import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { createKafka, kafkaSettings } from '../../infra/events/kafka.client.js';
import {
  KafkaEventRunner,
  type EventLoop,
  type OutboxBody,
} from '../../infra/events/kafka-event-runner.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';

export const ACTIVITY_STATS_GROUP = 'activity-stats';
const SEEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// Atomic: chỉ tăng bộ đếm nếu event này chưa được thấy. Xử lý lại cùng event (at-least-once) không đếm hai lần.
const COUNT_ONCE = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
  redis.call('INCR', KEYS[2])
  return 1
end
return 0`;

export const statsKey = (channelId: string, day: string) => `stats:msg:${channelId}:${day}`;
const dayOf = (iso?: string) => (iso ?? new Date().toISOString()).slice(0, 10).replaceAll('-', '');

/**
 * Consumer group thứ hai trên topic outbox (ADR-0101): đếm tin nhắn mới mỗi kênh mỗi ngày vào Redis.
 * Chạy độc lập với indexer AI: offset riêng, lỗi của một bên không chặn bên kia.
 */
@Injectable()
export class ActivityStatsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ActivityStatsService.name);
  private runner: EventLoop | undefined;

  constructor(
    private readonly redis: RedisProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async countMessageCreated(body: OutboxBody): Promise<boolean> {
    if (body.type !== 'message.created' || !body.id) return false;
    const payload = body.payload as { channelId?: string; createdAt?: string } | null;
    if (!payload?.channelId) return false;
    const counted = await this.redis.eval(
      COUNT_ONCE,
      2,
      `stats:seen:${body.id}`,
      statsKey(payload.channelId, dayOf(payload.createdAt)),
      SEEN_TTL_SECONDS,
    );
    return counted === 1;
  }

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    const settings = kafkaSettings(this.config);
    this.runner = new KafkaEventRunner(
      createKafka({ ...settings, clientId: `${settings.clientId}-stats` }),
      settings,
      async (body) => void (await this.countMessageCreated(body)),
      {
        groupId: ACTIVITY_STATS_GROUP,
        spanName: 'stats.count',
        onError: (error, context) =>
          this.logger.warn({ err: (error as Error).message, context }, 'activity stats error'),
      },
    );
    this.runner.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.runner?.stop();
  }
}

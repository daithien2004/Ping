import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { RedisProvider } from '../redis/redis.module.js';
import { EVENT_PUBLISHER, type EventPublisher } from './event-publisher.js';
import { kafkaSettings } from './kafka.client.js';
import { KafkaPublisher } from './kafka.publisher.js';
import { OutboxService } from './outbox.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';
import { RedisStreamPublisher } from './redis-stream.publisher.js';

@Module({
  providers: [
    OutboxService,
    OutboxRelayService,
    {
      provide: EVENT_PUBLISHER,
      inject: [ConfigService, RedisProvider, MetricsService],
      useFactory: (
        config: ConfigService<Env, true>,
        redis: RedisProvider,
        metrics: MetricsService,
      ): EventPublisher =>
        config.get('BUS_DRIVER', { infer: true }) === 'kafka'
          ? new KafkaPublisher(kafkaSettings(config), metrics)
          : new RedisStreamPublisher(redis),
    },
  ],
  exports: [OutboxService],
})
export class EventsModule {}

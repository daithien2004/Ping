import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { EVENT_PUBLISHER, type EventPublisher } from './event-publisher.js';
import { kafkaSettings } from './kafka.client.js';
import { KafkaPublisher } from './kafka.publisher.js';
import { OutboxService } from './outbox.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';

@Module({
  providers: [
    OutboxService,
    OutboxRelayService,
    {
      provide: EVENT_PUBLISHER,
      inject: [ConfigService, MetricsService],
      useFactory: (config: ConfigService<Env, true>, metrics: MetricsService): EventPublisher =>
        new KafkaPublisher(kafkaSettings(config), metrics),
    },
  ],
  exports: [OutboxService],
})
export class EventsModule {}

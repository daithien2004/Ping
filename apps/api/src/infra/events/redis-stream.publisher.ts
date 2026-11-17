import { Injectable } from '@nestjs/common';
import { RedisProvider } from '../redis/redis.module.js';
import type { EventPublisher, OutboxMessage } from './event-publisher.js';

export const OUTBOX_STREAM = 'stream:outbox';

@Injectable()
export class RedisStreamPublisher implements EventPublisher {
  constructor(private readonly redis: RedisProvider) {}

  get isUp(): boolean {
    return this.redis.isUp;
  }

  async publish(event: OutboxMessage): Promise<void> {
    await this.redis.xadd(
      OUTBOX_STREAM,
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
  }
}

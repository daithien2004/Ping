import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';

@Module({
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService],
})
export class EventsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EventsModule } from '../../infra/events/events.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MessageRateLimiter } from './message-rate-limiter.js';
import { ReactionRateLimiter } from './reaction-rate-limiter.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, EventsModule, RealtimeModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageRateLimiter, ReactionRateLimiter, SearchService],
})
export class MessagesModule {}

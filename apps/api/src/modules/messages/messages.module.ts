import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MessageRateLimiter } from './message-rate-limiter.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageRateLimiter],
})
export class MessagesModule {}

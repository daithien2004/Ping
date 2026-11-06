import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { ReadStateService } from './read-state.service.js';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ReadStateService],
  // ADR-0077: UsersModule dùng lại để phục vụ GET /users/me/unread (unread gộp).
  exports: [ReadStateService],
})
export class ChannelsModule {}

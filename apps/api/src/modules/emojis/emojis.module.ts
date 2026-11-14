import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { EmojisController } from './emojis.controller.js';
import { EmojisService } from './emojis.service.js';

@Module({
  imports: [AuthModule, AttachmentsModule, RealtimeModule],
  controllers: [EmojisController],
  providers: [EmojisService],
})
export class EmojisModule {}

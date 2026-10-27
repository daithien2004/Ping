import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ServersController } from './servers.controller.js';
import { ServersService } from './servers.service.js';

@Module({
  // JwtAuthGuard cần AuthService trong context của module này; TG.7 dùng AttachmentsService
  // để gắn icon server (pipeline TG.6).
  imports: [AuthModule, RealtimeModule, AttachmentsModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}

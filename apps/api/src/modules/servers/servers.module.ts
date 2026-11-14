import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { BansController } from './bans.controller.js';
import { BansService } from './bans.service.js';
import { ServersController } from './servers.controller.js';
import { ServersService } from './servers.service.js';

@Module({
  imports: [AuthModule, RealtimeModule, AttachmentsModule],
  controllers: [ServersController, BansController],
  providers: [ServersService, BansService],
})
export class ServersModule {}

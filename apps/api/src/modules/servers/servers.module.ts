import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ServersController } from './servers.controller.js';
import { ServersService } from './servers.service.js';

@Module({
  // JwtAuthGuard cần AuthService trong context của module này.
  imports: [AuthModule, RealtimeModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}

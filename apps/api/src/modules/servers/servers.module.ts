import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ServersController } from './servers.controller.js';
import { ServersService } from './servers.service.js';

@Module({
  // JwtAuthGuard cần AuthService trong context của module này.
  imports: [AuthModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}

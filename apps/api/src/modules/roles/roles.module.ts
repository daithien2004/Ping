import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}

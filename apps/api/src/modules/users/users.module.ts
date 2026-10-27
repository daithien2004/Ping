import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, AttachmentsModule, RealtimeModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

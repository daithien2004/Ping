import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { StickersController } from './stickers.controller.js';
import { StickersService } from './stickers.service.js';

// AuditModule toàn cục (@Global) nên không cần import — StickersService ghi AuditLog trực tiếp.
@Module({
  imports: [AuthModule, AttachmentsModule, RealtimeModule],
  controllers: [StickersController],
  providers: [StickersService],
})
export class StickersModule {}

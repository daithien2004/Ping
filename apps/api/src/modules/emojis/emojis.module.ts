import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { EmojisController } from './emojis.controller.js';
import { EmojisService } from './emojis.service.js';

// AuditModule toàn cục (@Global) nên không cần import — EmojisService ghi AuditLog trực tiếp.
// AttachmentsModule xuất `Storage` để service đọc metadata tệp `.ready` (cờ animated).
@Module({
  imports: [AuthModule, AttachmentsModule, RealtimeModule],
  controllers: [EmojisController],
  providers: [EmojisService],
})
export class EmojisModule {}

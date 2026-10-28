import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DmsController } from './dms.controller.js';
import { DmsService } from './dms.service.js';

/** TG.9 (ADR-0070): DM 1:1 + chặn người dùng — POST/GET /dms, block/unblock user. */
@Module({
  imports: [AuthModule],
  controllers: [DmsController],
  providers: [DmsService],
})
export class DmsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentWorker } from './attachment-worker.js';
import { LocalStorage, Storage } from './local-storage.js';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentWorker,
    LocalStorage,
    { provide: Storage, useExisting: LocalStorage },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

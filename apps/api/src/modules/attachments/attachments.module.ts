import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentWorker } from './attachment-worker.js';
import { ObjectStorage, Storage } from './object-storage.js';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentWorker,
    ObjectStorage,
    { provide: Storage, useExisting: ObjectStorage },
  ],
  exports: [AttachmentsService, Storage],
})
export class AttachmentsModule {}

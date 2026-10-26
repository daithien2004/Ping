CREATE TABLE "Attachment" (
  "id" UUID NOT NULL,
  "uploaderId" UUID NOT NULL,
  "channelId" UUID NOT NULL,
  "serverId" UUID NOT NULL,
  "messageId" UUID,
  "nonce" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mime" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "width" INTEGER,
  "height" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Attachment_uploaderId_nonce_key" ON "Attachment"("uploaderId", "nonce");
CREATE INDEX "Attachment_uploaderId_status_idx" ON "Attachment"("uploaderId", "status");
CREATE INDEX "Attachment_serverId_status_idx" ON "Attachment"("serverId", "status");
CREATE INDEX "Attachment_status_createdAt_idx" ON "Attachment"("status", "createdAt");
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

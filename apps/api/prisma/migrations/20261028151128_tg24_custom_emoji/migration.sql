-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'EMOJI_DELETE';

-- CreateTable
CREATE TABLE "CustomEmoji" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "attachmentId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomEmoji_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomEmoji_attachmentId_key" ON "CustomEmoji"("attachmentId");

-- CreateIndex
CREATE INDEX "CustomEmoji_serverId_deletedAt_createdAt_idx" ON "CustomEmoji"("serverId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomEmoji" ADD CONSTRAINT "CustomEmoji_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEmoji" ADD CONSTRAINT "CustomEmoji_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

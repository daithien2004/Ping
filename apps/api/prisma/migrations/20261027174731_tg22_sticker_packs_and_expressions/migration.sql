-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STICKER_DELETE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN     "stickerId" UUID;

-- CreateTable
CREATE TABLE "StickerPack" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StickerPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" UUID NOT NULL,
    "packId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[],
    "attachmentId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StickerPack_serverId_position_idx" ON "StickerPack"("serverId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_attachmentId_key" ON "Sticker"("attachmentId");

-- CreateIndex
CREATE INDEX "Sticker_packId_deletedAt_createdAt_idx" ON "Sticker"("packId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Message_stickerId_idx" ON "Message"("stickerId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerPack" ADD CONSTRAINT "StickerPack_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TG.7 (ADR-0053 tái sử dụng): Attachment mở cho hồ sơ — avatar (không thuộc server/channel)
-- và icon server (thuộc server, không qua channel). Expand: thêm cột, nới ràng buộc, không xóa gì.
ALTER TABLE "Attachment" ALTER COLUMN "channelId" DROP NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "serverId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'message';
ALTER TABLE "Attachment" ADD COLUMN "boundAt" TIMESTAMP(3);
CREATE INDEX "Attachment_scope_status_idx" ON "Attachment"("scope", "status");

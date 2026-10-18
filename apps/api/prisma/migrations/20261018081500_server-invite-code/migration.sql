-- Guide 10.1: "tham gia bằng invite" — mỗi server có mã mời rút gọn, share được.
-- Backfill bằng chính id server hiện có (id là uuid, đảm bảo unique) rồi mới NOT NULL.
ALTER TABLE "Server" ADD COLUMN "inviteCode" TEXT;
UPDATE "Server" SET "inviteCode" = id;
ALTER TABLE "Server" ALTER COLUMN "inviteCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Server_inviteCode_key" ON "Server"("inviteCode");

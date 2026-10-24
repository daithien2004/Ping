-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SERVER_INVITE_REGENERATE';

-- CreateTable
CREATE TABLE "ServerInvite" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ServerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerInvite_code_key" ON "ServerInvite"("code");

-- CreateIndex
CREATE INDEX "ServerInvite_serverId_revokedAt_idx" ON "ServerInvite"("serverId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ServerInvite" ADD CONSTRAINT "ServerInvite_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerInvite" ADD CONSTRAINT "ServerInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (T3.6, expand/contract): mỗi server đang có một mã trong `Server.inviteCode`
-- — chuyển thành bản ghi `ServerInvite` đang hoạt động (không hạn, chưa thu hồi) do
-- owner tạo, để `join` tra bảng này mà không gãy với dữ liệu cũ.
INSERT INTO "ServerInvite" ("id", "serverId", "code", "createdById", "createdAt")
SELECT gen_random_uuid(), s."id", s."inviteCode", s."ownerId", s."createdAt"
FROM "Server" s;

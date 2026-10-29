-- TG.11 (ban/unban) — migration expand: chỉ THÊM bảng mới và giá trị enum, không đụng
-- cột/bảng cũ nên rolling deploy an toàn. Sinh bằng `prisma migrate diff
-- --from-config-datasource --to-schema prisma/schema.prisma --script` (DB dev đã ở đầu
-- migrations), deploy bằng `migrate deploy`.
--
-- ServerBan tồn tại ĐỘC LẬP với Member: ban gỡ membership TRƯỚC rồi mới ghi hàng ban,
-- hàng ban phải còn sau khi Member đã xóa để chặn join lại bằng mã mời — nên KHÔNG có
-- FK tới Member. bannedById RESTRICT theo mẫu ServerInvite.createdBy (người ra lệnh phải
-- còn nguyên để hiện trong danh sách ban; AuditLog không có FK là mẫu khác — ban cần join
-- ra tên người ban ngay trong bảng, không qua tra cứu riêng).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SERVER_BAN';
ALTER TYPE "AuditAction" ADD VALUE 'SERVER_UNBAN';

-- CreateTable
CREATE TABLE "ServerBan" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT,
    "bannedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerBan_serverId_id_idx" ON "ServerBan"("serverId", "id" DESC);

-- CreateIndex
CREATE INDEX "ServerBan_userId_idx" ON "ServerBan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerBan_serverId_userId_key" ON "ServerBan"("serverId", "userId");

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

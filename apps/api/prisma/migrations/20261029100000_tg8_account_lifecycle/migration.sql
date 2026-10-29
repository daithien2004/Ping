-- TG.8 (vòng đời tài khoản) — migration expand, không xóa/đổi cột nào (rolling deploy an toàn).
-- Sinh bằng `prisma migrate diff` giữa schema cũ (HEAD) và schema mới, deploy bằng `migrate deploy`.

-- Cờ tài khoản đã xác minh email; default false cho user mới (chính sách chưa xác minh
-- chặn tạo server/mã mời). User seed được seed.ts gán true.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Phiên: tóm tắt thiết bị (tính lúc tạo từ User-Agent) + lần dùng gần nhất (mỗi lần refresh).
-- Hàng cũ nhận DEFAULT ('' và CURRENT_TIMESTAMP) nên danh sách phiên vẫn đọc được.
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "device" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Token một lần cho xác minh email / đặt lại mật khẩu: DB chỉ giữ băm SHA-256.
-- CreateTable
CREATE TABLE "EmailToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_idx" ON "EmailToken"("userId");

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

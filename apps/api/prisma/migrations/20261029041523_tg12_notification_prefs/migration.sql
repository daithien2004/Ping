-- TG.12: prefs thông báo theo server/channel (mức all/mentions/none + mute có hạn).
-- Expand an toàn rolling deploy: bảng mới, không đụng bảng/cột có sẵn. Không FK tới
-- Server/Channel (prefs sống khi target bị xóa — dọn bằng nhánh dọn riêng, xem schema.prisma).
-- CreateTable
CREATE TABLE "NotificationPref" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPref_userId_idx" ON "NotificationPref"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPref_userId_scope_targetId_key" ON "NotificationPref"("userId", "scope", "targetId");

-- AddForeignKey
ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

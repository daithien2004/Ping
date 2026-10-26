-- TG.2 (ADR-0064): cảm xúc trên tin. Một user thả một emoji một lần (unique), gỡ = xóa hàng.
-- Expand only: bảng mới + index; không sửa cột hiện có. Tin bị xóa cứng kéo theo cảm xúc (Cascade).
CREATE TABLE "MessageReaction" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_emoji_idx" ON "MessageReaction"("messageId", "emoji");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_userId_idx" ON "MessageReaction"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: @everyone hiện có được thêm ADD_REACTIONS (bit 1024) để tính năng không bị khóa
-- trên các server đã tạo trước TG.2. Server mới nhận bit này lúc tạo @everyone.
UPDATE "Role" SET "permissions" = "permissions" | 1024 WHERE "isDefault" = true;

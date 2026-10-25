-- TG.1 (plan 5.5/TG.1): reply — tin trỏ tới tin gốc CÙNG channel. SetNull: tin gốc
-- bị xóa cứng thì tham chiếu tự gỡ; soft-delete giữ hàng để hiển thị "tin đã xóa". Expand only.
ALTER TABLE "Message" ADD COLUMN "replyToId" UUID;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

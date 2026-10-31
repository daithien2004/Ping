-- TG.10 (category + sắp xếp + topic) — migration expand: chỉ THÊM bảng/cột/index mới, không
-- đụng cột/bảng cũ nên rolling deploy an toàn (code phiên bản trước vẫn chạy được). Sinh bằng
-- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
-- (DB dev đã ở đầu migrations), deploy bằng `migrate deploy`.
--
-- ChannelCategory: nhóm channel trong sidebar, vị trí lexorank so sánh theo chuỗi
-- (packages/shared/src/lexorank.ts) — chèn giữa hai nhóm chỉ đụng MỘT hàng, không đánh số
-- lại hàng loạt. Trần 50 category/server do ứng dụng kiểm (shared/limits.ts, ADR-0028).
--
-- Channel.categoryId: onDelete SET NULL (KHÔNG Cascade) — xóa category phải GIỮ channel,
-- kênh về vùng mặc định; API cũng tự đặt NULL + positionKey NULL trong cùng transaction,
-- SetNull ở DB chỉ là lưới an toàn. Channel.position Int cũ KHÔNG đụng: vẫn là thứ tự của
-- vùng mặc định (channel ngoài category), positionKey là nguồn sự thật THỨ TỰ TRONG category.

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "positionKey" TEXT,
ADD COLUMN     "topic" TEXT;

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CHANNEL_REORDER';

-- CreateTable
CREATE TABLE "ChannelCategory" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelCategory_serverId_position_idx" ON "ChannelCategory"("serverId", "position");

-- CreateIndex
CREATE INDEX "Channel_categoryId_idx" ON "Channel"("categoryId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ChannelCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelCategory" ADD CONSTRAINT "ChannelCategory_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

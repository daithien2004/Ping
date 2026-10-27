-- TG.7: @everyone hiện có CHANGE_NICKNAME (bit 2048) — thành viên đặt được biệt danh của chính
-- mình ngay cả trên server tạo trước khi có bit. Cùng pattern backfill ADD_REACTIONS (ADR-0064).
UPDATE "Role" SET "permissions" = "permissions" | 2048 WHERE "isDefault" = true;

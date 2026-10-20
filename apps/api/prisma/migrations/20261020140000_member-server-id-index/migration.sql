-- CreateIndex
-- Phân trang cursor của GET /servers/:id/members: WHERE serverId = ? AND id > ? ORDER BY id.
-- Bảng Member còn nhỏ nên CREATE INDEX thường là đủ; bảng lớn thì tạo bằng CONCURRENTLY trong một
-- migration riêng chỉ có một câu lệnh (hướng dẫn 16.2).
CREATE INDEX "Member_serverId_id_idx" ON "Member"("serverId", "id");

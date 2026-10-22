---
name: expand-contract-migration
description: Thay schema Prisma hoặc migration Ping, cần rolling deploy và rollback an toàn
---

Đọc CLAUDE.md, docs/runbook/migrations.md, schema thật và ADR liên quan. Viết test cho logic/lỗi
trước; kiểm API Prisma đúng phiên bản. Không sửa migration đã commit trên main.

Checklist: thêm cột/bảng tương thích → triển khai code đọc/ghi chuyển tiếp → backfill có giới hạn
→ đo/kiểm dữ liệu → contract ở đợt sau khi code cũ đã dừng. Migration chạy target riêng trước rollout.
Kiểm DB rỗng, drift và upgrade từ phiên bản trước theo CI hiện có. Ghi thời gian khóa bảng,
ngân sách downtime, backup và cách rollback ứng dụng không rollback schema.

Đúng: thêm cột mới nullable và backfill riêng. Sai: rename/drop cột cùng deploy còn code cũ.
Không chạy migrate/reset/drop trên staging nếu thiếu quyền hoặc backup/restore đã kiểm chứng.

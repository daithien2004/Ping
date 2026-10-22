---
name: adr-writer
description: Viết ADR khi thêm hoặc đổi quyết định kiến trúc Ping; không dùng cho sửa lỗi thuần implementation
---

Đọc CLAUDE.md, ADR-0038, kiến trúc và ADR cũ của chủ đề. Xem số thực tế trong docs/adr rồi chọn
số tiếp theo, không ghi đè số đã dùng chỉ vì plan dự kiến số đó.

Checklist: vấn đề và ràng buộc → Decision → Reason → Alternatives considered → Consequences
→ References. Ghi status proposed/accepted trung thực, ngày, cách rollout/rollback nếu ảnh hưởng
runtime. Đổi quyết định cũ thì dẫn tới ADR cũ và chỉ rõ phần thay thế, không sửa lịch sử.
Không ghi accepted nếu OWNER mới chỉ đồng ý bắt đầu task; dùng duyệt cụ thể đã có trong phiên.

Đúng: “proposed; đo bundle trong spike trước khi chọn UI”. Sai: “accepted; sẽ chắc chắn nhanh hơn”
khi chưa có duyệt hoặc số đo. Kiểm docs/format và lưu bằng chứng theo task.

---
name: staging-deploy
description: Chuẩn bị deploy, rollback, backup hoặc restore Ping trên staging đã được phép
disable-model-invocation: true
---

Chỉ thực hiện khi OWNER giao deploy/drill. Đọc ADR môi trường, runbook, quyền đã có và tình
trạng backup trước; thiếu thì chuẩn bị tài liệu review, không bịa tên host/domain/lệnh.

Checklist: SHA → image/label → migrate target riêng → rollout → smoke HTTPS/socket → metrics
và alert. Có SHA rollback, tương thích schema cũ, DB/Redis/metrics không public; secret ngoài repo.
Backup mã hóa ngoài máy; restore vào DB mới và so số hàng/fingerprint, đo RPO/RTO.
Ghi môi trường/ngày/commit/image/cách chạy và kết luận; không đưa secret vào evidence.

Đúng: restore DB mới rồi so dữ liệu. Sai: drop DB staging để diễn tập hoặc mua VPS vì dự toán
nhỏ hơn 20 USD mà chưa được giao. Không tự push main/tag, xoay secret hay xóa volume.

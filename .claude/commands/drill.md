---
description: Chuẩn bị và chạy một drill đã được phép theo runbook Ping
argument-hint: '<redis|restart|deploy-rollback|restore>'
disable-model-invocation: true
---

Drill yêu cầu: `$ARGUMENTS`. Đọc runbook, phạm vi ADR-0038 và tình trạng môi trường trước.
Ghi kỳ vọng, tài nguyên bị tác động, cách phục hồi và bằng chứng cần thu. Chỉ dùng dữ liệu demo
và môi trường được OWNER cho phép; thao tác phá hủy staging phải có duyệt rõ ràng trong phiên.
Quyền đã có thì không hỏi lại. Không chạy một tên drill không có runbook hoặc đổi sang production.

Chạy đúng lệnh đã đối chiếu trong repo, không bịa lệnh từ tên drill. Không xóa volume/DB đang
phục vụ; restore vào DB mới. Ghi commit/image, môi trường, thời gian, kỳ vọng so với quan sát,
RPO/RTO nếu áp dụng, kết luận và việc sửa. Không dán secret/nội dung tin vào log.

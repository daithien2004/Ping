---
description: Thực thi task Ping đã chốt phạm vi, có test-first, review và bằng chứng
argument-hint: '<task-id>'
disable-model-invocation: true
---

Đọc task `$ARGUMENTS` từ kế hoạch local, status, CLAUDE.md/CONTRIBUTING.md và ADR liên quan.
Kiểm tra Git worktree, phụ thuộc, thiết kế và duyệt đã có. Không ghi đè thay đổi của OWNER.
Nếu thiếu thiết kế cho thay đổi lớn, dùng /plan-feature trước, không hỏi lại duyệt đã có.

Tạo nhánh riêng. Dùng test-first cho logic/lỗi: test đỏ đúng lý do rồi mới implementation.
Chạy bộ chuẩn và kiểm bổ sung theo loại đổi; không bỏ test/lint hay tự hạ ngưỡng. Giao reviewer
và security-reviewer đọc diff, cung cấp danh sách file và bằng chứng; sửa phát hiện có căn cứ.

Lưu evidence theo task với commit/môi trường/ngày/cách chạy lại, cập nhật status sau task và
tài liệu liên quan. Stage file cụ thể, kiểm sau hook rằng không lọt tài liệu local/secret.
Soạn mô tả PR theo template; không tự merge, push main, gắn tag hay mua dịch vụ.
Nếu thiếu quyền/tài nguyên/runtime, ghi giới hạn thật và bước còn chờ; không đánh dấu done.

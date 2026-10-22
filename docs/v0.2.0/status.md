# Trạng thái Ping v0.2.0

Phạm vi đã được OWNER duyệt ngày 2026-10-22: [ADR-0038](../adr/0038-release-scope-v0.2.0.md). Hai tài liệu đầu vào kế hoạch
và project overview được giữ local theo yêu cầu OWNER ngày 2026-10-22, không commit.
Chưa sao chép kế hoạch sang `docs/v0.2.0/plan.md` để tránh đưa lại nội dung OWNER loại khỏi commit.

| Task | Trạng thái (`todo`/`doing`/`blocked`/`done`) | Nhánh/PR                                      | Commit                           | Bằng chứng                      | Ghi chú / điều đã học                                                                                                |
| ---- | -------------------------------------------- | --------------------------------------------- | -------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| T0.1 | done                                         | `docs/t0.1-release-scope` / PR nháp local     | `7f0e4ae`                        | [T0.1](evidence/T0.1/README.md) | OWNER duyệt ADR-0038 ngày 2026-10-22; kiểm tra local đạt. Chưa merge/push/CI remote.                                 |
| T0.2 | done                                         | `docs/t0.2-sync-release-docs` / PR nháp local | Commit chứa T0.2; base `7f0e4ae` | [T0.2](evidence/T0.2/README.md) | Đồng bộ đủ năm chênh lệch; format/docs đạt, kiểm tra code dùng cache T0.1. Chưa merge/push/CI/review CODEOWNERS mới. |
| T0.3 | todo                                         |                                               |                                  |                                 | Workflow Claude Code; chưa cài đặt hay chạy thử.                                                                     |
| T0.4 | todo                                         |                                               |                                  |                                 | Hiện chỉ tạo status/evidence tối thiểu cho T0.1; chưa hoàn tất cấu trúc và mẫu.                                      |
| T0.5 | todo                                         |                                               |                                  |                                 | [S] Đồng bộ phiên bản manifest.                                                                                      |
| T0.6 | todo                                         |                                               |                                  |                                 | Chưa chạy lại baseline tải.                                                                                          |
| T0.7 | todo                                         |                                               |                                  |                                 | ADR/spike UI và hướng thiết kế; chưa thay bộ UI hiện tại.                                                            |

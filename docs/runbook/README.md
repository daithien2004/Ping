# Runbook

Tra cứu khi vận hành. Các runbook mới (tra lỗi, migration, sao lưu, rollback) nói rõ lệnh nào **đã được chạy thử** và lệnh nào chỉ theo tài liệu.

| Tình huống                                    | Đọc                                              |
| --------------------------------------------- | ------------------------------------------------ |
| Người dùng báo lỗi, có "Mã lỗi" trên màn hình | [trace-by-request-id.md](trace-by-request-id.md) |
| Cần đổi schema DB, hoặc migration lỗi         | [migrations.md](migrations.md)                   |
| Mất dữ liệu, cần sao lưu hoặc khôi phục       | [backup-restore.md](backup-restore.md)           |
| Bản mới có vấn đề, cần quay lại               | [rollback.md](rollback.md)                       |
| Postgres hoặc Redis hỏng, tắt instance        | [failure-modes.md](failure-modes.md)             |
| Có cảnh báo từ Prometheus                     | [alerts.md](alerts.md)                           |

Chưa có `deploy.md`: quy trình triển khai phụ thuộc nơi chạy thật, sẽ viết trước phiên bản `v0.1.0`
([ADR-0032](../adr/0032-ci-and-containers.md)).

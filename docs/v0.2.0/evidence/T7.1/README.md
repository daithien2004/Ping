# T7.1 — Bộ công cụ pilot (pilot thật chờ người)

- Ngày/múi giờ: 2026-11-01 (Asia/Saigon).
- Người thực hiện: agent (Qoder); OWNER duyệt phạm vi lô gộp 3.
- Task, nhánh: T7.1 — `feat/batch3-tf13-tf15-t7`, base `3ed2ff4`, PR nháp local.
- Commit chứa bằng chứng: commit T7.1 của lô 3 (xem `git log`).
- Môi trường: không chạy pilot; chỉ soạn công cụ và đối chiếu luồng với demo đã diễn tập T7.4.
- Phạm vi: [acceptance/pilot.md](../../acceptance/pilot.md) — T7.1 yêu cầu 5–10 người trong 3–5
  ngày, cần người thật và môi trường dùng chung, nên task ở trạng thái `blocked`.

## Đã giao

| Hạng mục                | Nội dung                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Kịch bản 9 luồng chính  | đăng nhập/join, chat + reply/reaction/pin, tệp, unread, search, AI + trích dẫn, DM/chặn, reconnect, cài đặt |
| Môi trường A (LAN)      | stack production local + chứng chỉ tự ký, bind LAN, DB riêng `ping_pilot`, seed demo; giới hạn ghi rõ       |
| Môi trường B (staging)  | chỉ mở sau T2.1–T2.11 (ADR-0059); không trộn số LAN với staging                                             |
| Lịch 3–5 ngày           | bảng ngày 0–5, ai làm, bằng chứng cần giữ                                                                   |
| Biểu mẫu phản hồi       | 8 câu, thang 1–5 + câu mở                                                                                   |
| Mẫu bug + mức P0/P1/P2  | có ô `requestId`, hướng dẫn đối chiếu runbook trace                                                         |
| Bảng kết quả + tiêu chí | bảng người/bug, tổng hợp bắt buộc, điều kiện kết thúc, dọn môi trường                                       |

## Kiểm chứng

| Tiêu chí đạt                           | Lệnh/cách thử                                                    | Kết quả | File log/ảnh/số đo |
| -------------------------------------- | ---------------------------------------------------------------- | ------- | ------------------ |
| Tài liệu liên kết đúng                 | `pnpm docs:check`                                                | pass    | đầu ra lệnh        |
| Định dạng tài liệu                     | `pnpm format:check`                                              | pass    | đầu ra lệnh        |
| Lệnh dựng môi trường khớp runbook/demo | đối chiếu `createdb`/`migrate deploy`/`seed:demo` với demo.md §1 | pass    | demo.md, deploy.md |
| Pilot thật                             | 5–10 người × 3–5 ngày                                            | not-run | chưa có người      |

## Giới hạn và bước tiếp tục

- Chưa có người tham gia, chưa có biên bản, chưa có lỗi nào do người dùng thật báo → H2 của cổng
  nghiệm thu giữ `chờ người`.
- Phương án LAN không thay staging: không có TLS công khai, thư thật, backup, Sentry; kết quả pilot
  LAN không được dùng để đóng V1–V9.
- Rủi ro riêng tư: chỉ dùng dữ liệu giả, thu hồi mã mời, `dropdb ping_pilot` và xóa tệp sau khi tổng hợp.
- Khi có người: chạy theo [pilot.md](../../acceptance/pilot.md), điền bảng kết quả, xử lý P0/P1,
  rồi cập nhật mục H2 và trạng thái T7.1 (`blocked` → `done`).

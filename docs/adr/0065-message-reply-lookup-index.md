# ADR-0065: Index tra cứu reply khi xóa tin

Status: accepted — sửa hiệu năng trong quá trình kiểm chứng TG.2
Date: 2026-10-26

## Context

ADR-0060 hoãn index `Message.replyToId` vì chưa có endpoint liệt kê reply. Tuy nhiên khóa
ngoại `ON DELETE SET NULL` tự chạy truy vấn theo cột này khi xóa cứng mỗi tin. Dọn fixture
read-state (105 tin bulk cùng các tin lẻ) timeout ở `message.deleteMany`, dù cả 8 assertion
nghiệp vụ đã đạt.

Đã tái hiện bằng `EXPLAIN (ANALYZE, BUFFERS) DELETE` trong transaction luôn rollback,
`statement_timeout=5s`: Postgres hủy tại `UPDATE ONLY Message SET replyToId = NULL WHERE
... = replyToId`. Đây là truy vấn ẩn của ràng buộc FK, không phải một nhu cầu API mới.

## Decision

Thêm B-tree index `Message(replyToId)` bằng migration expand mới
`20261026094000_message_reply_lookup`; khai báo cùng index trong Prisma schema. Không sửa
migration reply đã merge, không đổi hành vi hay hợp đồng API.

## Alternatives

- Tăng timeout hoặc bỏ cleanup: che nguyên nhân, tiếp tục quét lịch sử theo số tin bị xóa.
- Bỏ `ON DELETE SET NULL`: phá hành vi giữ tin trả lời khi tin gốc bị xóa cứng.
- Chỉ thêm index khi có endpoint liệt kê reply: bỏ sót truy vấn phát sinh từ khóa ngoại.

## Consequences

- Mỗi insert/update `replyToId` có thêm chi phí duy trì index; việc tìm reply khi xóa không
  cần quét toàn bộ lịch sử nữa.
- Code trước vẫn chạy được với schema mở rộng; rollback code giữ nguyên index.
- `CREATE INDEX` giữ khóa khi tạo. Migration này dành cho DB local/pilot; với bảng lớn trên
  staging cần đánh giá `CREATE INDEX CONCURRENTLY` theo runbook trước khi triển khai.
- Đo lại truy vấn rollback và chạy lại read-state/reaction e2e; kết quả lưu cùng evidence TG.2.

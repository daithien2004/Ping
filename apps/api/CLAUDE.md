# Backend Ping

Đọc [hướng dẫn gốc](../../CLAUDE.md), [CONTRIBUTING](../../CONTRIBUTING.md) và
[API conventions](../../docs/api-conventions.md). Các quy tắc gốc vẫn bắt buộc.

- ESM/nodenext: import relative có đuôi `.js`. Logic trong service, controller chỉ parse/gọi/trả.
- Zod/type/event/error/limits chung ở `@ping/shared`. Mỗi endpoint có guard xác thực và CASL;
  luật quyền chỉ trong `defineAbilityFor`. List luôn ràng buộc server/channel.
- ID tài nguyên mới: thêm `ID_ROUTES` và tình huống tấn công trong `test/idor.e2e-spec.ts`.
- REST ghi Postgres trước realtime; không dùng socket làm nơi ghi dữ liệu bền. Outbox/worker chỉ
  triển khai theo ADR task đã duyệt, không coi thiết kế tương lai là code hiện có.
- Retry create phải idempotent. DB đổi bằng migration expand/contract mới; không sửa migration
  đã ở main. Viết test logic/lỗi đỏ trước khi sửa implementation.
- Redis request-path: `failOpen()` hoặc `redisUnavailable()` theo ADR-0026, không catch bỏ qua
  mặc định. Lỗi hạ tầng 503; response không lộ nội bộ; log có requestId/socketId, không nội dung tin.
- Hành động nhạy cảm ghi AuditLog. Sentry qua scrubber; dependency mới có metric sức khỏe.
- Tra API thư viện đúng phiên bản đã cài. Không đọc hoặc ghi `.env`/khóa thật qua tool; dùng
  tài liệu cấu hình công khai và biến môi trường khi chạy lệnh đã được phép.

Kiểm: bộ chuẩn ở gốc; thêm `pnpm --filter api test:e2e` khi đổi API/service/realtime, IDOR,
authz, Redis outage, API conventions và migration theo loại thay đổi. Không ghi e2e đạt nếu
chưa có DB/Redis thật và kết quả chạy. Evidence/status theo task, không tự merge/push.

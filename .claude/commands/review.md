---
description: Review diff hiện tại theo các quy tắc bắt buộc trong CLAUDE.md và checklist PR của ping
argument-hint: '[nhánh hoặc commit để so, mặc định: main]'
---

Review thay đổi hiện tại của nhánh so với `$ARGUMENTS` (mặc định `main`): chạy `git diff main...HEAD` và `git status`,
đọc đầy đủ các file đã đổi (không chỉ phần diff) và các test liên quan.

Đối chiếu từng điều dưới đây, chỉ báo cái **vi phạm hoặc đáng ngờ** kèm `file:dòng`, bằng chứng và cách sửa. Không báo
những điều đã đúng, không khen.

1. **Quyền (CLAUDE.md 9, 16):** endpoint mới/đổi có zod + `JwtAuthGuard` + kiểm quyền CASL ở backend? Truy vấn liệt kê
   có ràng buộc `serverId`/`channelId` trong `where`? Endpoint có tham số ID có dòng test IDOR? Có `if (role === …)`
   rải rác thay vì `defineAbilityFor`?
2. **Rò rỉ (10, 11):** response có lộ `passwordHash`, refresh token, lỗi nội bộ? Log có mật khẩu, token, nội dung tin
   nhắn, hoặc thiếu `requestId`/`socketId`? Hành động nhạy cảm có ghi `AuditLog`?
3. **Dữ liệu (6, 7, 12, 13):** phân trang bằng cursor (không offset)? Đổi DB có migration, theo expand/contract (code bản
   trước còn chạy được), không sửa migration đã merge? Endpoint tạo mà client có thể retry có idempotency?
4. **Hợp đồng (4, 14, 19):** kiểu/schema có nằm ở `@ping/shared` thay vì định nghĩa lại? Mã lỗi lấy từ `ErrorCodes`?
   Hình dạng response, lỗi, phân trang, tên event theo `docs/api-conventions.md`?
5. **Hạ tầng (1, 2, 17, 21):** có state dùng chung trong RAM? Chỗ gọi Redis trên đường request có chính sách khi Redis
   chết (`failOpen()` hoặc `redisUnavailable()`)? Lỗi hạ tầng trả 503 chứ không 500? Metrics/Sentry theo quy tắc 21?
6. **Web (mục Frontend, 20):** TanStack Query cho dữ liệu server, Zustand chỉ cho UI? Dữ liệu server chỉ ghi cache trong
   `features/<miền>/hooks.ts`? `useParams()` trong page? Màu thô thay vì token? Chữ hiển thị qua `useTranslations` và có
   cả `vi.json` lẫn `en.json`? Ẩn nút thay cho kiểm quyền? Có e2e Playwright (gồm axe) cho thay đổi UI?
7. **Kiểm thử:** có test cho logic/lỗi mới? Test có thật sự đỏ khi bỏ phần sửa (đọc test và nói bạn có tin không, nếu
   nghi thì chỉ ra cách phá thử)?
8. **Tài liệu (15):** thay đổi kiến trúc có ADR? README, runbook, CLAUDE.md có cần cập nhật không?
9. **Thư viện:** API thư viện dùng đúng phiên bản đang cài trong `package.json`? Dependency mới đã nêu lý do?

Kết thúc bằng: danh sách vấn đề xếp theo mức độ (chặn merge / nên sửa / gợi ý), rồi một dòng kết luận có nên merge
không và còn thiếu gì để merge. Không tự sửa code trừ khi được yêu cầu.

## Thay đổi gì và vì sao

<!-- Một vài câu. Liên kết issue, ADR hoặc kế hoạch đã duyệt nếu có. -->

## Checklist

**Chất lượng**

- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` đều xanh
- [ ] Có test cho logic/lỗi mới, và test đỏ khi bỏ phần sửa (đã thử phá code)
- [ ] E2E liên quan đã chạy (API: `pnpm --filter api test:e2e`; UI: `pnpm --filter web test:e2e`, gồm axe và `check:bundle`)

**Quyền và bảo mật**

- [ ] Endpoint mới/đổi có validate zod, guard xác thực và kiểm quyền CASL ở backend
- [ ] Truy vấn liệt kê ràng buộc `serverId`/`channelId`; endpoint có tham số ID đã thêm dòng vào test IDOR
- [ ] Không lộ `passwordHash`, token, lỗi nội bộ ra response; lỗi dùng mã trong `ErrorCodes`
- [ ] Hành động nhạy cảm (đổi role, kick, xóa tin người khác) ghi `AuditLog`

**Dữ liệu và vận hành**

- [ ] Đổi schema có migration; theo expand/contract, code bản trước vẫn chạy được (rolling deploy, rollback)
- [ ] Không sửa migration đã merge
- [ ] Chỗ gọi Redis mới có chính sách khi Redis chết (`failOpen()` hoặc `redisUnavailable()`)
- [ ] Log có `requestId`/`socketId`, không log mật khẩu, token, nội dung tin nhắn
- [ ] Hạ tầng phụ thuộc mới đã thêm vào `dependency_up` (metrics) nếu cần

**Tài liệu**

- [ ] ADR mới hoặc cập nhật nếu đổi/thêm quyết định kiến trúc
- [ ] `docs/`, README hoặc CLAUDE.md cập nhật nếu hành vi, lệnh hoặc quy tắc đổi
- [ ] Chữ hiển thị mới có trong cả `vi.json` và `en.json`
- [ ] Dependency mới (nếu có): đã nêu lý do ở trên và ghim phiên bản chính xác

## Cách đã kiểm chứng

<!-- Lệnh đã chạy, ảnh chụp màn hình với thay đổi UI, số đo với thay đổi hiệu năng. -->

## Rủi ro và cách quay lại

<!-- Có gì có thể hỏng khi deploy? Rollback thế nào (xem docs/runbook/rollback.md)? -->

# Bằng chứng T3.3 — UI vai trò: tạo, gán cho thành viên, thứ tự hiển thị

- Ngày: 2026-10-24.
- Người thực hiện: chủ repo; nhánh `feat/t3.3-role-ui`, base `95d93d7` (merge T5.7).
- Task: T3.3 (Pha 3) — kế hoạch local `docs/ping-v0.2.0-plan.md` (không commit).
- Commit code: `a406b65`; commit bằng chứng này ở sau.
- Phạm vi: chỉ web. Không đổi API, schema Prisma hay migration; quyền vẫn theo bit quyền
  ([ADR-0004](../../../adr/0004-role-permission-grants.md)), `position` chỉ là thứ tự hiển thị.

## Phạm vi

Yêu cầu T3.3: danh sách vai trò, tạo/sửa bitmask quyền dễ hiểu, thứ tự ưu tiên, gán vai trò cho
thành viên; e2e chứng minh **không gán được vai trò cao hơn mình** và **realtime
`permissions.changed` cập nhật UI**.

TF.10 đã có danh sách, sửa bitmask theo nhóm, xoá vai trò và chi tiết thành viên. T3.3 bổ sung:

- **Tạo vai trò**: nút trong vùng Vai trò → `PingModal` + `PingForm` + nhóm `PingCheckbox`;
  vị trí mới nối sau vai trò cuối (`nextPosition`), quyền mặc định 0.
- **Gán vai trò**: drawer chi tiết thành viên có danh sách checkbox; `@everyone` luôn hiện và
  khoá; vai trò vượt quyền người thao tác hoặc thành viên đích mạnh hơn/owner bị khoá kèm nhãn
  "vượt quyền của bạn"; lưu qua `PUT /servers/:serverId/members/:memberId/roles`.
- **Thứ tự hiển thị**: cột Thứ tự với nút lên/xuống (`PingIconButton`), `@everyone` luôn đầu và
  không đổi được; mỗi lần đổi gửi `PATCH /roles/:id` cho các vai trò đổi vị trí.
- **Ghi chú thẩm quyền**: dưới bảng nêu rõ thứ tự chỉ ảnh hưởng hiển thị, thẩm quyền theo bit
  quyền — không tạo ADR mới vì không đổi quyết định kiến trúc.
- Toàn bộ chuỗi mới có vi/en; component chỉ dùng bộ `Ping*` + token, không import `antd`.

### Files chính

- `apps/web/src/features/admin/permissions.ts`: `effectiveMemberPermissions`, `memberContext`,
  `isRoleAssignable`, `assignableRoles`, `nextPosition`, `reorderUpdates` — dùng lại
  `canManageMember`/`canManagePermissions` của `@ping/shared` để UI khớp API.
- `apps/web/src/features/admin/permissions.test.ts`: 9 test mới (tổng 13).
- `apps/web/src/features/admin/api.ts`, `hooks.ts`: `createRole`, `assignMemberRoles`,
  `useCreateRole`, `useAssignMemberRoles`, `useReorderRoles` (invalidate roles/members/server/
  permissions).
- `apps/web/src/features/admin/components/role-create-dialog.tsx` (mới), `role-editor.tsx`,
  `member-details-drawer.tsx`, `admin-surface.tsx` (truyền `serverId`/`ownerId`).
- `apps/web/messages/vi.json`, `en.json`.
- `apps/web/e2e/admin-roles.spec.ts` (mới).

## Thay đổi và kiểm chứng

| Tiêu chí đạt                                                            | Lệnh/cách thử                                                            | Kết quả | Số đo/log                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Helper gán vai trò/thứ tự đúng, viết test trước                         | `pnpm --filter web test -- --run src/features/admin/permissions.test.ts` | pass    | Đỏ 9/13 (thiếu hàm) → 1/13 (kỳ vọng thứ tự sai) → 13/13 pass                                                                      |
| Unit toàn web không hồi quy                                             | `pnpm --filter web test`                                                 | pass    | 20 file, 126 test                                                                                                                 |
| Typecheck web                                                           | `pnpm --filter web typecheck`                                            | pass    | `next typegen` + `tsc --noEmit`                                                                                                   |
| Lint web (không `antd` ngoài `components/ui`)                           | `pnpm --filter web lint`                                                 | pass    | 0 lỗi                                                                                                                             |
| Tạo vai trò qua UI, quyền lưu đúng bitmask, vị trí nối sau vai trò cuối | `pnpm --filter web exec playwright test e2e/admin-roles.spec.ts`         | pass    | 43,2 s; role mới `VIEW_AUDIT_LOG`, `position = 5`                                                                                 |
| Đổi thứ tự bằng nút lên; `@everyone` không đổi được                     | cùng spec, bước "đổi thứ tự hiển thị"                                    | pass    | poll API thấy `[audit, order]`; nút "Đưa @everyone lên" disabled                                                                  |
| Gán vai trò qua drawer → thành viên thấy UI đổi **không reload**        | cùng spec, bước "gán role qua drawer → realtime mở UI"                   | pass    | vùng Nhật ký hành động xuất hiện ≤ 15 s sau `permissions.changed`                                                                 |
| Không gán được vai trò mạnh hơn mình: UI khoá **và** API từ chối        | cùng spec, bước "quản lý role không gán được role mạnh hơn mình"         | pass    | checkbox `strong-*` disabled + nhãn; `PUT .../roles` trả `403`                                                                    |
| E2E web toàn bộ không hồi quy                                           | `pnpm --filter web exec playwright test`                                 | pass    | 26 test: 25 pass, 1 skip                                                                                                          |
| Build production + ngân sách bundle                                     | `pnpm --filter web build`; `pnpm --filter web check:bundle`              | pass    | JS ban đầu **243,8 KB** gzip / 8 chunk; chunk ban đầu lớn nhất 74,7 KB; chunk route lớn nhất 134,4 KB (Sentry) — trần 450/100/160 |
| Format + tài liệu                                                       | `pnpm format:check`; `pnpm docs:check`                                   | pass    | xem log lần chạy này                                                                                                              |

Không chạy lại API e2e: T3.3 không sửa API/schema; phần enforcement tập con quyền và IDOR của
`POST /servers/:id/roles`, `PUT /servers/:id/members/:memberId/roles`, `PATCH /roles/:id` đã có
trong `apps/api/test/roles-authz.e2e-spec.ts` và `apps/api/test/idor.e2e-spec.ts`. E2E web ở trên
gọi thẳng API thật để xác nhận `403` khi vượt thứ bậc.

### Ghi chú khi chạy e2e

- Spec tự tạo server riêng, mời 3 user và xoá server ở cuối để không đụng dữ liệu spec khác.
- Rate limit e2e 100 request/phút/IP: giữa các lần chạy lại phải chờ ~65 s nếu gặp
  `429 TOO_MANY_REQUESTS`.
- `WEB_PORT=3101` chỉ dùng được khi API khởi động với `WEB_ORIGIN` tương ứng; lần chạy lấy bằng
  chứng dùng cổng mặc định 3000 của Playwright.

## Review, giới hạn và tiếp tục

- **Thứ tự chỉ để hiển thị**: không cấp thêm quyền, không đổi `canManageMember`; đúng ADR-0004
  ("position hierarchy deferred"). Nếu sau này muốn thứ bậc theo vị trí thì cần ADR mới.
- **Không có endpoint đổi hàng loạt**: mỗi lần đổi thứ tự phát một `PATCH` cho từng vai trò đổi
  vị trí; số vai trò bị giới hạn bởi `Limits`, và UI chỉ invalidate sau khi tất cả thành công.
- **Chưa có kéo–thả**: cố ý dùng nút lên/xuống để giữ bàn phím/a11y và tránh thêm thư viện.
- **E2E phụ thuộc thời gian thực**: chờ 1,5 s cho socket thành viên nối trước khi đổi quyền; trên
  máy chậm có thể cần tăng, nhưng timeout chờ UI là 15 s nên vẫn ổn định.
- Chưa đo trên staging; chưa có review độc lập. Không có thay đổi DB nên không cần rollout đặc biệt.

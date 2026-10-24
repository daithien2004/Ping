# Bằng chứng T3.4 — UI thành viên: danh sách, kick có kiểm thứ bậc, hiển thị vai trò

- Ngày: 2026-10-24.
- Người thực hiện: chủ repo; nhánh `feat/t3.4-member-kick-ui`, base `9175b78` (merge T3.3).
- Task: T3.4 (Pha 3) — kế hoạch local `docs/ping-v0.2.0-plan.md` (không commit).
- Commit code: `1608077`; bằng chứng: `a94e855`; sửa CI (seed) + cập nhật bằng chứng: `70b36b6`.
- Phạm vi: chỉ web. Không đổi API, schema Prisma hay migration; quyền vẫn theo bit quyền
  ([ADR-0004](../../../adr/0004-role-permission-grants.md)).

## Phạm vi

Yêu cầu T3.4: bảng thành viên trong bề mặt quản trị hiển thị vai trò, có nút kick và **chặn kick
theo thứ bậc** (không kick owner, không tự kick, không kick người mạnh hơn mình).

API đã có sẵn `DELETE /servers/:serverId/members/:memberId` (T2.x) với đủ luật, nên T3.4 chỉ làm
phần giao diện và gọi đúng endpoint:

- **Cột Thao tác** gộp "Chi tiết" + "Kick"; nút kick dùng `PingPopconfirm` để xác nhận.
- **Chặn theo thứ bậc**: `kickBlockReason(actor, target)` trả `self` / `owner` / `stronger` /
  `null`, dựng từ `memberContext` (quyền hiệu lực của member đích) và dùng lại
  `canKickMember` của `@ping/shared` — cùng hàm API dùng, nên UI không thể lệch luật server.
- Nút bị khoá có `aria-label` nêu lý do ("Kick X — thành viên mạnh hơn bạn"), để trình đọc màn
  hình và e2e kiểm được lý do chứ không chỉ trạng thái `disabled`.
- **Hiển thị vai trò**: cột Vai trò render `RoleTag` theo thứ tự API trả về (đã sắp theo
  `position`), rỗng thì hiện "Chưa có vai trò".
- **Quyền vào bề mặt**: `hasAdminAccess` thêm `canKick` (`delete Member`), nếu không thì thành
  viên chỉ có KICK_MEMBERS không mở được màn hình dù API cho phép kick.
- Toàn bộ chuỗi mới có vi/en; chỉ dùng bộ `Ping*` + token, không import `antd`.

### Files chính

- `apps/web/src/features/admin/permissions.ts`: `KickBlockReason`, `kickBlockReason`.
- `apps/web/src/features/admin/permissions.test.ts`: 5 test mới (tổng 18).
- `apps/web/src/features/admin/api.ts`, `hooks.ts`: `kickMember`, `useKickMember` (invalidate
  members/roles/server).
- `apps/web/src/features/admin/components/admin-surface.tsx`: `canKick`, ngữ cảnh actor từ
  `useMe` + `/me/permissions`, cột Thao tác, `PingPopconfirm`.
- `apps/web/messages/vi.json`, `en.json`.
- `apps/web/e2e/admin-members.spec.ts` (mới).

## Thay đổi và kiểm chứng

| Tiêu chí đạt                                                                | Lệnh/cách thử                                                            | Kết quả | Số đo/log                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Helper thứ bậc kick đúng, viết test trước                                   | `pnpm --filter web test -- --run src/features/admin/permissions.test.ts` | pass    | đỏ 5/18 (`kickBlockReason is not a function`) → 3/18 (dùng chung userId) → 18/18                                                   |
| Unit toàn web không hồi quy                                                 | `pnpm --filter web test`                                                 | pass    | 20 file, 131 test                                                                                                                  |
| Typecheck web                                                               | `pnpm --filter web typecheck`                                            | pass    | `next typegen` + `tsc --noEmit`                                                                                                    |
| Lint web (không `antd` ngoài `components/ui`)                               | `pnpm --filter web lint`                                                 | pass    | 0 lỗi                                                                                                                              |
| Chỉ KICK_MEMBERS vẫn vào được danh sách thành viên, không thấy vùng Vai trò | `pnpm --filter web exec playwright test e2e/admin-members.spec.ts`       | pass    | 44,4 s; `region "Vai trò"` có 0 phần tử                                                                                            |
| Nút kick khoá đúng lý do: owner / mạnh hơn / chính mình                     | cùng spec, bước "hiển thị vai trò và khoá kick theo thứ bậc"             | pass    | aria-label chứa "không thể kick chủ server", "thành viên mạnh hơn bạn", "không thể tự kick mình"; nút của thành viên yếu `enabled` |
| Vai trò hiển thị trong bảng                                                 | cùng spec, cùng bước                                                     | pass    | thấy `kick-<suffix>` và `strong-<suffix>`                                                                                          |
| API cũng chặn (UI không phải lớp bảo vệ duy nhất)                           | cùng spec, bước "API cũng chặn"                                          | pass    | owner `403`, người mạnh hơn `403`, tự kick `400`                                                                                   |
| Kick qua UI → người bị kick rời server ngay, không reload                   | cùng spec, bước "kick qua UI"                                            | pass    | toast "Đã kick thành viên."; URL rời `/servers/<id>` ≤ 15 s; marker `window.__pingE2E` còn nguyên (điều hướng client)              |
| E2E web toàn bộ không hồi quy                                               | `pnpm --filter web exec playwright test`                                 | pass    | 27 test: 26 pass, 1 skip (6,9 phút)                                                                                                |
| Build production + ngân sách bundle                                         | `pnpm --filter web build`; `pnpm --filter web check:bundle`              | pass    | JS ban đầu **243,8 KB** gzip / 8 chunk; chunk ban đầu lớn nhất 74,7 KB; chunk route lớn nhất 134,4 KB — trần 450/100/160           |
| Format + tài liệu                                                           | `pnpm format:check`; `pnpm docs:check`                                   | pass    | xem log lần chạy này                                                                                                               |
| CI remote đủ 8 job                                                          | GitHub Actions cho `70b36b6`                                             | pass    | 8/8 job xanh; lần trước (`a94e855`) đỏ `web-e2e` vì CI thiếu seed, đã thêm bước `prisma db seed`                                   |

Không chạy lại API e2e: T3.4 không sửa API/schema. Luật kick đã có test riêng
(`apps/api/test/kick.e2e-spec.ts`) và IDOR (`DELETE /servers/:serverId/members/:memberId` nằm
trong `ID_ROUTES`); e2e web ở trên gọi thẳng API thật để xác nhận `403/400`.

### Ghi chú khi chạy e2e

- **Rate limit là ràng buộc thật**: `POST /auth/register` chỉ 5 lượt/phút/IP, `POST /auth/login`
  10 lượt/phút/IP, toàn cục 100 request/phút/IP, và cả bộ e2e chạy trên cùng một IP. Bản đầu của
  spec đăng ký 3 user mới, cộng với 3 user của `admin-roles` chạy ngay sau → 429, làm đỏ 3 spec
  (không liên quan logic T3.4). Bản cuối dùng tài khoản seed (`bob@`, `carol@`, `alice@` —
  `password123`, chỉ dev) nên spec này **không đăng ký user nào**; tổng lượt đăng ký mỗi phút
  trở lại dưới ngưỡng.
- **CI phải seed giống dev**: lần chạy `a94e855` đỏ ở `login('bob@ping.dev')`
  (`expect(response.ok())` false) vì job `web-e2e` chỉ chạy migrate, không chạy seed — DB dev local
  thì luôn có sẵn seed. Đã thêm bước `pnpm --filter api exec prisma db seed` vào job (idempotent,
  id cố định + upsert) để CI khớp môi trường dev.
- Spec tự tạo server riêng rồi xoá ở cuối. Một lần chạy hỏng trước đó để lại server `Members *`;
  đã xoá tay bằng SQL để dữ liệu dev sạch.
- `WEB_PORT=3101` chỉ dùng được khi API khởi động với `WEB_ORIGIN` tương ứng; lần chạy lấy bằng
  chứng dùng cổng 3101 vì cổng 3000 đang bận app khác trên máy.

## Review, giới hạn và tiếp tục

- **Kick không phải ban**: người bị kick vào lại được bằng mã mời (đúng thiết kế hiện tại; ban là
  hạng mục sau, cần cột DB + migration expand/contract).
- **Danh sách thành viên của người khác không tự cập nhật**: `member.removed` chỉ phát tới
  `user:<id>` của người bị kick (để họ rời UI ngay), không phát tới room server. Admin khác đang
  mở bảng sẽ thấy dòng cũ tới khi query được làm mới. Đề xuất follow-up: phát
  `member.removed`/`member.roles.updated` cho room `server:<id>` hoặc invalidate theo event.
- **Không có thao tác hàng loạt** (kick nhiều người, đổi role nhiều người): giữ UI đơn giản, mỗi
  hành động một request; API cũng chưa có endpoint bulk.
- **Chưa đo trên staging**; chưa có review độc lập. Không có thay đổi DB nên không cần rollout đặc
  biệt.
- Tiếp theo: T3.5 (nhật ký hành động: lọc + phân trang), T3.6 (mã mời: hiển thị/tạo lại/hết hạn),
  T3.7 (vi/en + tách route admin lazy, đo lại bundle).

# T3.1 — Đổi tên server trong bề mặt quản trị

- Ngày: 2026-10-23.
- Người thực hiện: chủ repo, nhánh `feat/t3.1-server-rename`, base `f550422` (merge ADR-0059).
- Task: T3.1 (Pha 3) — [plan](../../../ping-v0.2.0-plan.md).
- Commit code: `6fbcf91`; commit tài liệu này ngay sau đó.

## Phạm vi

Task yêu cầu chỉnh sửa thông tin server (đổi tên) với quyền tương ứng, audit ghi hành động, và
UI trong bề mặt quản trị. Bản này làm **đổi tên**; xoá server đã có từ TF.10 (nút nguy hiểm +
`PingPopconfirm` + audit `SERVER_DELETE`), nên không lặp lại.

### Shared + API

- `packages/shared/src/schemas/server.ts`: `updateServerSchema` dùng chung luật 1–100 ký tự sau
  `trim` với lúc tạo server; `UpdateServerResult = { id, name }`.
- `packages/shared/src/schemas/audit.ts`: thêm `AuditAction.SERVER_UPDATE`.
- `apps/api/prisma/schema.prisma` + migration `20261023120000_audit-server-update`: thêm giá trị
  enum `SERVER_UPDATE` (migration chỉ `ALTER TYPE ... ADD VALUE`, không đụng bảng/dữ liệu).
- `PATCH /api/v1/servers/:serverId` (`servers.controller.ts`): `@CheckAbility(['update','Server'])`
  (tức `MANAGE_SERVER`), validate bằng `updateServerSchema`.
- `ServersService.update`: đọc tên cũ, cập nhật tên và ghi audit `SERVER_UPDATE` với
  `metadata: { from, to }` **trong cùng một transaction**; server không tồn tại → 404.
- Trả về `{ id, name }` thay vì cả `ServerDetail` để client cập nhật cache mà không tải lại
  channel/role.

### Web

- `apps/web/src/features/servers/api.ts` + `hooks.ts`: `updateServer` và `useUpdateServer`.
  Khi lưu xong, ghi tên mới vào cache `qk.server(serverId)` và `qk.servers` để rail + sidebar đổi
  ngay, không cần refetch.
- `apps/web/src/features/admin/components/server-name-form.tsx` (mới): vùng "Thông tin server"
  với `PingForm`/`PingInput`/`PingButton`, validate bằng `zodFormRules(updateServerSchema)` —
  cùng schema với API. Toast thành công/thất bại, nút tắt trạng thái lỗi khi người dùng sửa lại.
- `admin-surface.tsx`: vùng đổi tên chỉ render khi `ability.can('update','Server')`; lấy tên hiện
  tại từ cache `useServer(serverId)` (đã có sẵn nhờ sidebar).
- `audit-log-table.tsx`: nhãn `SERVER_UPDATE` ("Đổi tên server").
- `apps/web/messages/{vi,en}.json`: thêm 5 khoá `admin.*` (tổng 54 khoá phẳng) — không hard-code.

## Kiểm chứng

| Tiêu chí         | Lệnh                                                                  | Kết quả                                                             |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Typecheck        | `pnpm typecheck`                                                      | pass                                                                |
| Unit test shared | `pnpm --filter @ping/shared test`                                     | pass (3 file, 28 test)                                              |
| Unit test web    | `pnpm --filter web test`                                              | pass (20 file, 114 test)                                            |
| Lint API/web     | `pnpm --filter api lint` / `pnpm --filter web lint`                   | pass (0 lỗi, 0 cảnh báo)                                            |
| API e2e (riêng)  | `vitest run --config ./vitest.config.e2e.ts test/servers.e2e-spec.ts` | pass (12 test)                                                      |
| API e2e (full)   | `pnpm --filter api test:e2e`                                          | **146 pass** (24 file)                                              |
| Web e2e (riêng)  | `WEB_PORT=3101 pnpm exec playwright test e2e/admin-surface.spec.ts`   | pass (1 test, 4 bước)                                               |
| Web e2e (full)   | `WEB_PORT=3101 pnpm exec playwright test`                             | **24 pass, 1 skip** (`local-deployment`, cần HTTPS local)           |
| Build web        | `pnpm --filter web build`                                             | pass                                                                |
| Bundle           | `pnpm --filter web check:bundle`                                      | pass — JS tải ban đầu **243.5 KB** (8 chunk), theo yêu cầu 599.3 KB |
| Định dạng        | `pnpm format:check`                                                   | pass                                                                |
| Tài liệu         | `pnpm docs:check`                                                     | pass                                                                |

### API e2e (`apps/api/test/servers.e2e-spec.ts`)

- Thành viên thường và người ngoài server gọi `PATCH /servers/:id` → **403**.
- Tên rỗng sau `trim` → **400** (cùng schema zod với lúc tạo).
- Owner đổi tên → 200, `{ id, name }`; `GET /servers/:id` của thành viên khác thấy tên mới.
- Ngay sau đó, trang audit mới nhất là `SERVER_UPDATE` với `targetId = serverId` và
  `metadata { from, to }` đúng tên cũ/mới.

### Web e2e (`apps/web/e2e/admin-surface.spec.ts`)

- Thành viên thường **không** thấy vùng "Thông tin server" (cùng chỗ kiểm tra không thấy nhật ký).
- Owner đổi tên qua form → toast "Đã đổi tên server.", rail đổi tên **không tải lại trang**, và
  `GET /servers/:id` trả tên mới. Bước cuối đổi lại tên cũ để server dùng chung của bộ e2e không
  bị ảnh hưởng.

## Sửa lỗi phát hiện khi kiểm chứng

- `apps/web/e2e/admin-surface.spec.ts`: nút "Lưu" của form đổi tên trùng tên với nút lưu vai trò →
  Playwright strict mode fail. Sửa bằng cách scope locator vào `region "Vai trò"`; không nới lỏng
  selector hay đổi nhãn UI.
- `apps/api/test/idor.e2e-spec.ts`: bộ đếm route IDOR bắt đúng endpoint mới — thêm
  `patch /servers/:id` và nâng số route 20 → 21 (kèm kiểm tra 401 khi chưa đăng nhập).

## Ghi chú / điều đã học

- **Audit phải nằm trong transaction**: tên cũ đọc trước khi update, nhưng nếu ghi audit ở ngoài
  transaction thì một lỗi giữa chừng để lại log không khớp dữ liệu. Transaction mảng của Prisma giữ
  cả hai cùng thành công/thất bại.
- **Trả về đúng trường vừa đổi** giúp cache cập nhật chính xác và tránh refetch cả `ServerDetail`
  (channel/role) chỉ vì một cái tên.
- **Schema dùng chung là hợp đồng**: web dùng lại `updateServerSchema` qua `zodFormRules`, nên luật
  `trim 1–100` không bị lệch giữa form và API.
- **Test phủ route làm việc thật**: endpoint mới làm `idor.e2e-spec.ts` đỏ ngay, buộc khai báo route
  và kiểm tra 401 thay vì chỉ thêm controller.
- Enum Prisma thêm giá trị chỉ cần `ALTER TYPE ... ADD VALUE`; migration đã áp dụng vào DB local,
  nếu reset DB phải chạy lại `prisma migrate deploy`.

## Giới hạn

- Chưa có realtime event `server.updated`: thành viên khác thấy tên mới sau khi tải lại/refetch,
  không cập nhật tức thời. Plan T3.1 không yêu cầu; nếu cần, làm cùng Pha G (đồng bộ danh sách).
- Chưa đổi `iconUrl`/các trường khác của server — task này chỉ đổi tên.
- Chưa push remote; merge vào `main` local theo quy ước hiện tại.

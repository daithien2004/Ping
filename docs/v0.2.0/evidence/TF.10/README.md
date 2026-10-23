# TF.10 — Bề mặt quản trị bằng bộ `Ping*`

- Ngày: 2026-10-23.
- Người thực hiện: chủ repo, nhánh `chore/tf.10-admin-surface`, base commit `e1b7468` (merge TF.9).
- Task: TF.10 (Pha 3/4) — [plan](../../../ping-v0.2.0-plan.md).
- Commit: `6d45445` (bề mặt quản trị + API audit), `9737234` (đo bundle ban đầu), commit tài liệu này;
  base `e1b7468`.

## Phạm vi

Task yêu cầu: `PingTable` cho audit log (lọc + phân trang cursor), `PingForm`/`PingPopconfirm`
cho hành động nguy hiểm, nhóm quyền bằng `PingCheckbox`, `PingTag` màu role, `PingDrawer` chi tiết;
nhất quán token; e2e theo quyền; lint cấm import antd ngoài `components/ui/`.

### API + shared

- `packages/shared/src/permissions.ts`, `ability.ts`, `ability.spec.ts`: thêm subject `AuditLog`
  và quyền `view AuditLog` (bit mới), cập nhật test CASL cho owner/member.
- `packages/shared/src/schemas/audit.ts` (mới): enum `AuditAction` (mirror Prisma), schema query
  `action`/`actorId`/`after`/`limit` (cursor `after` = id bản ghi cuối, UUIDv7 tăng dần) và DTO
  `AuditLogEntryDto`/`AuditLogPage`.
- `apps/api/src/modules/audit/*` (mới): `AuditService.record()` (ghi trong transaction, `requestId`
  từ CLS — tách từ các service cũ) + `AuditService.list()` và `GET /servers/:serverId/audit-log`
  với `@CheckAbility(['view','AuditLog'])`. Không phải thành viên hoặc thiếu quyền → 403 trước khi
  vào service; chỉ lọc theo `serverId` của route nên không đọc chéo server (IDOR).
- Các service đã ghi audit chuyển sang dùng `AuditService.record` (roles, servers, channels,
  messages) — không đổi hành vi ghi, chỉ gom một chỗ.

### Web

- `apps/web/src/app/(app)/servers/[serverId]/settings/page.tsx` (mới): route cài đặt server, lấy
  `serverId` từ params (không đọc `window`), render `AdminSurface`.
- `apps/web/src/features/admin/` (mới):
  - `permissions.ts` + `permissions.test.ts`: chia quyền theo nhóm, `maskOf`/`permissionsOf` cho
    bitmask; test đơn vị cho mask và nhóm.
  - `api.ts`/`hooks.ts`: query/mutation roles + audit log, invalidate theo `query-keys`.
  - `components/admin-surface.tsx`: bề mặt theo quyền — vai trò, thành viên, nhật ký; trạng thái
    `noAccess` khi thiếu quyền; vùng nguy hiểm xoá server dùng `PingPopconfirm`.
  - `components/role-editor.tsx`: `PingTable` + `PingTag` màu role, sửa tên, bật/tắt quyền theo
    nhóm (`PingCheckbox`), lưu qua `PingForm`; xoá role phải xác nhận; role `@everyone` không sửa/xoá.
  - `components/audit-log-table.tsx`: `PingTable` cho nhật ký, lọc theo hành động/người thực hiện,
    phân trang cursor ("Tải thêm"), mỗi dòng có `requestId` để đối chiếu log API.
  - `components/member-details-drawer.tsx`: `PingDrawer` chi tiết thành viên (tên, username, vai trò,
    trạng thái, ngày vào) — tách chunk bằng `next/dynamic`, chỉ mount khi mở (xem ADR-0058).
- `apps/web/src/features/channels/components/channel-sidebar.tsx` + `server-rail.tsx`: mục "Cài đặt"
  chỉ hiện khi có quyền quản trị; `query-keys.ts` thêm key audit.
- `apps/web/src/components/ui/ping-table.tsx`, `ping-drawer.tsx`, `ping-popconfirm.tsx`: siết API
  riêng (không rò prop antd), thêm trạng thái rỗng/đang tải, `data-testid`, đóng bằng phím Esc.
- `apps/web/messages/{vi,en}.json`: namespace `admin` (73 khoá) — toàn bộ chữ trên màn hình đi qua
  `useTranslations('admin')`, không hard-code.

### Ngân sách bundle (ADR-0058)

- Phát hiện `check:bundle` cũ cộng **mọi** chunk của mọi route rồi gọi là "JS client ban đầu":
  `main` tại TF.9 đã 605.1 KB > 550 KB (gate đỏ sẵn) dù JS tải ban đầu chỉ 243.0 KB.
- `apps/web/scripts/bundle-budget.mjs` đo lại theo `build-manifest.json`: JS tải ban đầu =
  `rootMainFiles` + `polyfillFiles` + `lowPriorityFiles` (≤ 450 KB), mỗi chunk ≤ 100 KB, chunk tải
  theo yêu cầu ≤ 160 KB. Vẫn in "tổng mọi chunk" để tham khảo; thiếu manifest thì fail rõ ràng.
- Tách `MemberDetailsDrawer` khỏi chunk trang cài đặt: chunk stack bảng 101.3 → 97.8 KB.

## Kiểm chứng

| Tiêu chí         | Lệnh                                      | Kết quả                                                                  |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Typecheck web    | `pnpm --filter web typecheck`             | pass                                                                     |
| Lint web         | `pnpm --filter web lint`                  | pass (0 lỗi, 0 cảnh báo)                                                 |
| Unit test web    | `pnpm --filter web test`                  | pass (20 file, 114 test — gồm 7 test cho `bundle-budget`)                |
| Unit test shared | `pnpm --filter @ping/shared test`         | pass (3 file, 28 test)                                                   |
| Typecheck API    | `pnpm --filter api typecheck`             | pass                                                                     |
| Build web        | `pnpm --filter web build`                 | pass                                                                     |
| Bundle           | `pnpm --filter web check:bundle`          | pass — JS tải ban đầu **243.5 KB** (8 chunk), chunk lớn nhất **97.8 KB** |
| E2E web          | `WEB_PORT=3101 pnpm exec playwright test` | **24 pass, 1 skip** (`local-deployment`, cần HTTPS local)                |
| E2E API          | `pnpm --filter api test:e2e`              | **145 pass** (24 file)                                                   |
| Định dạng        | `pnpm format:check`                       | pass                                                                     |
| Tài liệu         | `pnpm docs:check`                         | pass                                                                     |

### Bundle — trước và sau (cùng máy, `.next` xoá trước khi build)

| Trạng thái    | JS tải ban đầu     | Chunk ban đầu lớn nhất | Tải theo yêu cầu | Chunk theo yêu cầu lớn nhất | Phép đo cũ (tổng mọi chunk) |
| ------------- | ------------------ | ---------------------- | ---------------- | --------------------------- | --------------------------- |
| `main` (TF.9) | 243.0 KB (8 chunk) | 74.2 KB                | 496.6 KB (38)    | 134.4 KB (Sentry, lazy)     | 605.1 KB → fail             |
| TF.10         | **243.5 KB** (8)   | **74.4 KB**            | 609.1 KB (43)    | **97.8 KB** (bảng admin)    | 714.8 KB → fail             |

Chi tiết quyết định và phương án bị loại: [ADR-0058](../../../adr/0058-bundle-budget-initial-js.md).

### E2E theo quyền (`apps/web/e2e/admin-surface.spec.ts`)

1. Owner thấy đủ ba vùng (Vai trò, Thành viên, Nhật ký); thành viên thường **không** thấy mục
   "Cài đặt" trên rail và không thấy nhật ký.
2. Cấp quyền `view AuditLog` cho role qua UI → thành viên đó thấy nhật ký; bỏ quyền → mất.
3. Sửa role: bật/tắt checkbox quyền, lưu → toast "Đã lưu vai trò."; xoá role phải xác nhận
   "Xoá vai trò này?" → toast "Đã xoá vai trò.".
4. Mở chi tiết thành viên trong `PingDrawer`; vùng nguy hiểm xoá server yêu cầu xác nhận.

## Sửa lỗi phát hiện khi kiểm chứng

- `apps/api/test/idor.e2e-spec.ts`: thêm `get /servers/:id/audit-log` vào `ID_ROUTES` (20 route) và
  chuẩn hoá dấu `/` cuối trong `discoverIdRoutes` — `@Get()` không tham số cho path `'/'` nên Nest
  báo `/audit-log/`, trước đây làm test phủ route fail.
- `apps/api/test/timeouts.e2e-spec.ts`: `PrismaService` đọc `PG_POOL_MAX` qua `getOrThrow`, nhưng
  `configWith` chỉ đọc `process.env` (bỏ qua default của zod) nên test fail khi máy không export
  biến này. Truyền `PG_POOL_MAX: 5` như các khoá còn lại — test vẫn kiểm đúng timeout, không nới
  ngưỡng.

## Ghi chú / điều đã học

- **Một phép đo sai làm cả release kẹt**: cộng mọi chunk rồi gọi là "bundle ban đầu" khiến mỗi
  route mới đều "vượt ngân sách" dù người dùng không tải thêm lúc mở trang. Số đo phải bám đúng
  thứ trình duyệt tải; nếu không, sẽ có áp lực nâng trần vô ích (hoặc tắt check).
- **Tách theo nhu cầu có tác dụng thật**: `next/dynamic` cho drawer vừa giảm chunk lớn nhất xuống
  dưới 100 KB vừa không tải drawer khi chưa mở chi tiết.
- **Test phủ route là lưới an toàn**: thêm endpoint mới là IDOR/route-coverage fail ngay — phải
  khai báo route vào `ID_ROUTES` kèm kiểm tra 401, không chỉ thêm controller.
- **i18n là hợp đồng kiểu**: `useTranslations` sinh type từ JSON; ghi đè file message làm mất
  namespace là typecheck fail hàng loạt. Khi sửa message nên merge theo namespace, không viết lại
  cả file.
- **Chạy API dev trong lúc `test:e2e` làm test chập chờn**: bộ e2e dựng app Nest mới cho từng file;
  `test:e2e` build lại `@ping/shared` trước khi chạy nên API dev (đang watch) restart và tranh
  connection pool, có lần làm hook `beforeAll` của `my-permissions` quá 10 s. Tắt API dev trước khi
  chạy bộ API e2e thì 145/145 pass; đây là vấn đề hạ tầng local, không phải test yếu.

## Giới hạn

- Ảnh trạng thái cho màn quản trị chưa có (TF.9 mới phủ app shell + auth); nên bổ sung khi làm
  TF.13 (visual regression).
- Audit log chỉ đọc + lọc cơ bản; chưa có export, chưa có retention/archival.
- Chưa push remote (theo yêu cầu, chỉ merge vào `main` local).

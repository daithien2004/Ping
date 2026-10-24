# Evidence `T3.6` — `Invite: hiển thị/sao chép mã, regenerate, hạn dùng, lỗi rõ ràng`

- Ngày/giờ: 2026-10-24 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên cùng ngày (phương án bảng
  `ServerInvite`).
- Task, nhánh: T3.6 — `feat/t3.6-invite` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `b01ba1d` (merge T3.5).
- Commit: `e5910ca` (tính năng + test), commit tài liệu này.
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant), Node/pnpm theo
  `pnpm-lock.yaml`.

## Thay đổi

### Shared (`packages/shared`)

- `errors.ts`: thêm mã lỗi `INVITE_EXPIRED`, `INVITE_REVOKED` (quy tắc 14 — không chuỗi tự do).
- `schemas/server.ts`: `regenerateInviteSchema` (`expiresInDays` 1–30, tùy chọn = không hạn),
  `InviteDto`, `RegenerateInviteResult`; `ServerDetail` thêm `inviteExpiresAt?`.
- `schemas/audit.ts`: `AuditActions.SERVER_INVITE_REGENERATE` (mirror Prisma).

### DB (migration expand/contract)

- Bảng mới `ServerInvite` (`code` unique, `expiresAt`, `revokedAt`, `createdById`, index
  `(serverId, revokedAt)`); `AuditAction` thêm giá trị `SERVER_INVITE_REGENERATE`.
- Migration `20261024140505_server_invite` có **backfill**: mỗi server hiện có chuyển mã trong
  `Server.inviteCode` thành bản ghi `ServerInvite` đang hoạt động. Không sửa migration đã merge;
  cột `Server.inviteCode` giữ lại làm bản sao hiển thị (contract bỏ sau).
- Seed tạo kèm bản ghi invite cho server playground (id cố định, idempotent).

### API

- `POST /servers/:serverId/invite/regenerate` — `@CheckAbility(['update','Server'])` (cùng mức
  MANAGE_SERVER với đổi tên) + `IdempotencyInterceptor` (quy tắc 12). Service thu hồi mọi mã đang
  hoạt động, cấp mã mới, đồng bộ `Server.inviteCode`, ghi audit `SERVER_INVITE_REGENERATE` —
  tất cả trong một transaction.
- `join` tra mã ở `ServerInvite`: mã thu hồi → `410 INVITE_REVOKED`, quá hạn → `410 INVITE_EXPIRED`,
  không tồn tại → `404` như cũ. `detail` trả kèm `inviteExpiresAt` của mã đang hoạt động.
- IDOR: thêm route vào `ID_ROUTES` (23) và một dòng tấn công outsider/rival/member vào
  `test/idor.e2e-spec.ts`; `limits.e2e-spec.ts` tạo bản ghi invite cho server dựng trực tiếp qua
  Prisma (join giờ tra bảng mới).

### Web

- Bề mặt quản trị thêm vùng "Mã mời" (quyền `update Server`): mã + hạn dùng, sao chép, chọn hạn
  (`PingSelect`: không hạn/1/7/30 ngày) và "Tạo mã mới" qua `PingPopconfirm`; toast mã mới;
  invalidate cache server + danh sách server.
- Bảng audit log có nhãn hành động mới (`admin.auditActions.serverInviteRegenerate`).
- Wizard tham gia server: `INVITE_EXPIRED`/`INVITE_REVOKED` hiện thông báo riêng qua
  `useErrorMessage` (không dùng `message` của server).
- i18n: 17 khoá mới `admin.*` + 2 khoá `servers.*` thêm vào **cả** `messages/vi.json` và `en.json`.

## Kiểm chứng

| Tiêu chí đạt                                      | Lệnh/cách thử                                                                                                                                         | Kết quả                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Regenerate vô hiệu mã cũ, mã lỗi riêng            | e2e `servers.e2e-spec.ts` (test mới): mã cũ → 410 `INVITE_REVOKED`, mã mới join 201, quá hạn (gán DB) → 410 `INVITE_EXPIRED`, audit có entry          | **13/13 pass**                                    |
| IDOR — người không đủ quyền không regenerate được | `idor.e2e-spec.ts`: dòng mới outsider/rival/member → 403; route-coverage & 401 kiểm 23 route                                                          | **5/5 pass**                                      |
| Join qua mã của server dựng trực tiếp             | `limits.e2e-spec.ts` (tran server thứ 100 + join mã lạ)                                                                                               | **3/3 pass**                                      |
| Luồng tham gia qua UI báo lỗi rõ                  | web e2e `admin-invite.spec.ts` (mới): xem/sao chép mã, regenerate có hạn dùng, mã cũ thu hồi hiển thị "Mã mời đã bị thu hồi.", mã mới vào được server | **pass**                                          |
| Bộ web e2e không hồi quy                          | `pnpm --filter web exec playwright test --workers=1`                                                                                                  | **27 pass, 1 skip** (local-deployment, cần HTTPS) |
| Bộ API e2e không hồi quy                          | `pnpm --filter api test:e2e`                                                                                                                          | **166/166 pass** (từ 148 — thêm test invite/IDOR) |
| Unit test                                         | `pnpm test` (shared + api + web)                                                                                                                      | pass (web 131)                                    |
| Lint / typecheck / format / docs                  | `pnpm lint`, typecheck api+web, `pnpm format:check`, `pnpm docs:check`                                                                                | pass                                              |
| Bundle ≤ 450 KB                                   | `pnpm --filter web check:bundle`                                                                                                                      | **243.9 KB** ban đầu (8 chunk)                    |

Chạy lại: hai lệnh e2e trong bảng với Docker đang chạy và seed đã nạp (`prisma db seed`).

## Review, giới hạn và tiếp tục

- Phát hiện khi làm: `limits.e2e-spec.ts` dựng server trực tiếp qua Prisma rồi join bằng mã —
  sau khi join tra bảng mới phải tạo luôn bản ghi `ServerInvite`; đã sửa trong cùng PR.
- Mỗi server một mã hoạt động; chưa có lịch sử mã/nhiều mã song song, chưa có link invite đầy đủ
  (ngoài phạm vi T3.6, thuộc TG sâu hơn nếu cần).
- Migration expand: cột `Server.inviteCode` còn lại; contract (bỏ cột) làm sau khi không còn
  phiên bản nào đọc cột này.
- Rollback: revert commit + `prisma migrate resolve --rolled-back` rồi drop bảng (dev only);
  bản production chưa tồn tại nên chưa cần runbook.
- Trạng thái: T3.6 **done**. Tiếp theo: T3.7 (i18n/lazy route quản trị + bundle) rồi Pha 4.

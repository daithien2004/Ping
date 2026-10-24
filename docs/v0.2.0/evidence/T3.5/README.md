# Evidence `T3.5` — `Audit log: endpoint đọc + UI lọc/phân trang`

- Ngày/giờ: 2026-10-24 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt đóng task trong phiên cùng ngày.
- Task, nhánh: T3.5 — `chore/t3.5-audit-log-verify` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit).
- Commit code được kiểm: `d6e55ff` (merge T3.4 vào `main`) — nhánh T3.5 không đổi code
  runtime, chỉ thêm tài liệu này và dòng status.
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant của
  `docker compose up -d`), Node theo `pnpm-lock.yaml`.
- Phạm vi: T3.5 là task **ghi nhận hiện trạng** — toàn bộ giao물 (endpoint, bit quyền, UI
  lọc/phân trang, IDOR) đã được TF.10 giao ngày 2026-10-23 (xem
  [evidence TF.10](../TF.10/README.md)). Việc của T3.5: đối chiếu từng tiêu chí với code
  và chạy lại test liên quan trên commit hiện tại, không viết tính năng mới.

## Thay đổi và kiểm chứng

Không đổi code. Đối chiếu tiêu chí T3.5 ("endpoint đọc + UI có lọc/phân trang; bit quyền xem;
IDOR test; không lộ log server khác") với hiện trạng:

| Tiêu chí đạt             | Vị trí code / cách thử                                                                                                                                                                                             | Kết quả | Ghi chú                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------- |
| Endpoint đọc audit log   | `apps/api/src/modules/audit/audit.controller.ts` — `GET /servers/:serverId/audit-log` sau `JwtAuthGuard + AbilityGuard`, `@CheckAbility(['view','AuditLog'])` (TF.10)                                              | pass    | Controller mỏng: parse → service                     |
| Bit quyền xem            | `packages/shared/src/permissions.ts` `VIEW_AUDIT_LOG: 256n`; `ability.ts` chỉ cấp `view AuditLog` khi role có bit (quy tắc 9: quyền chỉ trong `defineAbilityFor`)                                                  | pass    | Test CASL trong `ability.spec.ts`                    |
| Không lộ log server khác | `audit.service.ts` `list()`: `where` luôn ràng buộc `serverId` của route + lọc `action`/`actorId`; guard từ chối trước khi vào service                                                                             | pass    | Phòng thủ hai lớp                                    |
| Phân trang cursor        | `take: limit + 1`, `id < after` (UUIDv7 giảm dần), trả `hasMore` (quy tắc 6)                                                                                                                                       | pass    | Không dùng offset                                    |
| UI lọc + phân trang      | `apps/web/src/features/admin/components/audit-log-table.tsx`: chọn lọc theo hành động, nút "Tải thêm" theo cursor, cột `requestId` đối chiếu log API; hiển thị sau quyền `view AuditLog` trong `admin-surface.tsx` | pass    | Chuỗi hiển thị qua i18n (TF.10)                      |
| IDOR test                | `apps/api/test/idor.e2e-spec.ts`: `get /servers/:id/audit-log` trong `ID_ROUTES`; bảng tấn công outsider/rival/member kiểm 403/404 + body không lộ dữ liệu server A + DB không đổi                                 | pass    | Test tự quét controller bắt route mới thiếu khai báo |

Lệnh chạy lại và kết quả trên commit `d6e55ff` (2026-10-24, máy local):

| Lệnh                                                                                                                                               | Kết quả                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @ping/shared test`                                                                                                                  | pass — 3 file, **28 test** (gồm `ability.spec.ts`: chỉ role có `VIEW_AUDIT_LOG` mới được `view AuditLog`) |
| `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/idor.e2e-spec.ts` (sau `docker compose up -d`)                             | pass — **5/5 test**, 46,9 s; kẻ tấn công outsider/rival/member đều bị 403/404, không rò dữ liệu           |
| CI run #38 trên `main` @ `d6e55ff` (job `web-e2e` gồm `admin-surface.spec.ts`: thành viên thường không thấy nhật ký, cấp `view AuditLog` mới thấy) | **8/8 job xanh** (xem status)                                                                             |

Không chạy lại toàn bộ `pnpm --filter api test:e2e` và `pnpm --filter web test:e2e` ở local:
nhánh không đổi code so với `main` đã được CI chạy đủ; e2e mục tiêu (IDOR, admin-surface)
đã chạy mới ở hai dòng trên.

## Review, giới hạn và tiếp tục

- Phát hiện: không có lỗ hổng mới. Lưu ý từ TF.10 vẫn còn hiệu lực: audit log chỉ đọc +
  lọc cơ bản; chưa có export, chưa có retention/archival (ngoài phạm vi T3.5).
- Chưa đo/kiểm: hiệu năng truy vấn audit-log trên tập lớn (chưa có yêu cầu ngưỡng trong
  tiêu chí T3.5).
- Rollout/rollback: không đổi code → không rủi ro runtime; tài liệu này chỉ là bằng chứng.
- Cách chạy lại: hai lệnh trong bảng trên trên checkout `d6e55ff` với Docker đang chạy.
- Trạng thái: T3.5 **done**. Bước tiếp theo: T3.6 (invite) rồi T3.7 (i18n/lazy route).

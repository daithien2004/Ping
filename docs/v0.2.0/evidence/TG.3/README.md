# Evidence TG.3 — Ghim tin nhắn

- Ngày: 2026-10-26 (Asia/Saigon).
- Người thực hiện: Codex; nhánh `feat/tg3-pins`.
- Base: `a78984f`; commit `9fc6b88`, merge `278d7e0` trên `main`, đã push; CI `main` 12/12 job xanh
  (run `40283015630`).
- Thiết kế: [ADR-0066](../../../adr/0066-message-pins.md); hằng số trần ở `@ping/shared`
  (`Limits.PINS_PER_CHANNEL = 50`).

## Phạm vi

Hai cột `Message.pinnedAt/pinnedById` (migration expand + index `(channelId, pinnedAt desc)`);
quyền `MANAGE_MESSAGES` + `VIEW_CHANNEL` qua subject `Pin` (không mở `update Message`); `PUT`/`DELETE
/messages/:messageId/pin` idempotent; `GET /channels/:channelId/pins` trả mảng ≤ 50, mới ghim trước;
audit `MESSAGE_PIN`/`MESSAGE_UNPIN`; event `message.pinned`/`message.unpinned`; web có mục menu
Ghim/Bỏ ghim, chỉ báo trên tin, panel danh sách ghim (tải lười, bấm để nhảy permalink, bỏ ghim).

## Lệch plan có chủ đích

Plan ghi `PUT/DELETE /channels/:id/pins/:messageId`; bản giao dùng `/messages/:messageId/pin` để
đồng nhất với reaction (`/messages/:id/reactions/:emoji`) và để channel suy từ tin (một nguồn chân
lý). Lý do đầy đủ ở ADR-0066 mục 3. Không đổi phạm vi: vẫn kiểm quyền theo server của channel, IDOR
có cả ba route mới.

Mã lỗi vượt trần là `PIN_LIMIT_REACHED` (400) thay vì `VALIDATION_ERROR` chung, để web báo đúng lý
do — plan yêu cầu "vượt giới hạn trả mã lỗi rõ".

## Hành vi đã chốt

1. **Idempotent**: ghim lại tin đã ghim / bỏ ghim tin chưa ghim trả 200 trạng thái hiện tại, không
   ghi audit, không phát event lần hai (e2e đếm event trong 400 ms).
2. **Trần chính xác**: đếm + ghi trong `pg_advisory_xact_lock(hashtext(channelId))`; e2e bắn hai
   request đồng thời khi đang có 49 tin ghim → đúng một 200 và một 400.
3. **Xóa mềm**: xóa tin gỡ ghim trong cùng transaction; danh sách và trần bỏ qua tin `deletedAt`
   khác null; ghim tin đã xóa → 404.
4. **Tin đã xóa mềm không chiếm chỗ**: e2e xóa một tin đang ghim rồi ghim tin mới thành công.

## Kiểm chứng hiện tại

| Kiểm tra             | Kết quả                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Migration            | 20 migration (3 mới: cột + index, `MESSAGE_PIN`, `MESSAGE_UNPIN`); `migrate deploy` và `migrate status` pass; diff schema↔migration do CI |
| Format / docs        | `pnpm format:check` và `pnpm docs:check` pass lúc 13:54 ngày 2026-10-26                                                                   |
| Lint / typecheck     | `pnpm lint` và `pnpm typecheck` pass toàn repo (51,7 s / 23,3 s)                                                                          |
| Unit API             | 194 pass / 25 file                                                                                                                        |
| Unit shared          | 35 pass / 4 file (thêm test quyền `Pin`: moderator được, thành viên thường không, `update Message` vẫn của tác giả)                       |
| Unit web             | 194 pass / 23 file (thêm 1 test `applyPin` cho cache thuần)                                                                               |
| Workflow test        | 27 pass                                                                                                                                   |
| Build production     | api + web pass (cần mạng cho font Google — chạy ngoài sandbox)                                                                            |
| Bundle ban đầu       | 245,1 KB gzip / 8 chunk; ngân sách 450 KB                                                                                                 |
| API e2e toàn bộ      | **263/263 pass, 32 file**, 221 s; `pins` 8/8, IDOR 32 route (3 route mới + 3 dòng tấn công), api-conventions có mẫu `PUT pin`/`GET pins`  |
| Web e2e (production) | `pin.spec` 1/1 (55 s: menu → chỉ báo, panel + axe sáng/tối, realtime hai tab, bỏ ghim) và `a11y` 3/3 pass; bộ đầy đủ để CI shard chạy     |

## Ghi chú môi trường (quan trọng cho phiên sau)

- Shell của phiên chạy ở mức tin cậy thấp (Low integrity): vitest/Playwright/node --test bị `EPERM`
  khi spawn tiến trình con, `next typegen`/turbo/Prisma không ghi được `.next`/`.turbo`/DB. Các lệnh
  kiểm chứng vì thế chạy ngoài sandbox một lượt; không sửa mã nguồn, không hạ ngưỡng test.
- Một API cũ (`node dist/main`, PID 4276) còn giữ cổng 4000 và **không** có route pin (probe trả 404);
  đã dừng đúng PID đó trước khi chạy e2e. Không kill node.exe hàng loạt.
- Lần chạy `pin.spec` đầu timeout: kịch bản cũ bắt bob (thành viên thường của server mới) bỏ ghim,
  nhưng quyền `MANAGE_MESSAGES` của seed chỉ thuộc server seed. Đã đổi sang chủ server bỏ ghim; realtime
  của bob vẫn được kiểm ở bước ghim.

## Chạy lại

```powershell
pnpm format:check
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web check:bundle
pnpm --filter api test:e2e
$env:WEB_PORT='3110'
$env:E2E_PRODUCTION='1'
pnpm --filter web test:e2e
```

## Giới hạn và tiếp theo

- Trạng thái task: **done** — commit `9fc6b88` (merge `278d7e0`) trên `main`, đã push; CI `main`
  12/12 job xanh (run `40283015630`), gồm đủ bộ web e2e theo shard có `pin.spec`.
- Event realtime vẫn best-effort (không số thứ tự phiên bản); REST là nguồn đối soát.
- Panel ghim không có ảnh chụp trong evidence (không nằm trong tiêu chí nghiệm thu TG.3); axe sáng/tối
  và ảnh của TG.2 vẫn là mẫu chụp màn hình.
- Sau TG.3 là TG.6 (upload/đính kèm, ADR-0053).

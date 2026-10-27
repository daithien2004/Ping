# Evidence TG.22 — Sticker

- Ngày: 2026-10-27 (Asia/Saigon); base `1b8476f`, nhánh dự kiến `feat/tg22-stickers`.
- Thiết kế: [ADR-0067](../../../adr/0067-sticker-packs-and-expressions.md) — **proposed, chờ OWNER
  duyệt** trước khi code.
- Trạng thái: `doing` — khảo sát xong, chưa code. Task lớn (model + tin kind + picker + quản trị +
  seed tài sản tự vẽ + e2e) nên tách phiên riêng để làm trọn theo cổng nghiệm thu (quy tắc 10:
  không bỏ mục [M]).

## Khảo sát đã chốt (nguồn: khảo sát code 2026-10-27)

- **Message chưa có `kind`**: `MessageDto` (packages/shared/src/schemas/message.ts:64-85) và model
  Message (schema.prisma:190-235) không có cột kind; tin chỉ-đính-kèm (`content:''` + attachment)
  đã cho phép từ TG.6 — kind='sticker' là lớp ngữ nghĩa + ràng buộc content rỗng.
- **Quyền**: `MANAGE_EXPRESSIONS` chưa tồn tại — bit trống tiếp theo `4096n`
  (packages/shared/src/permissions.ts); nhóm quyền UI ở `features/admin/permissions.ts:23-46`;
  kiểm tra `seed.ts` khi thêm.
- **Pipeline TG.6 tái dùng**: thêm scope `'sticker'` vào `createUploadSchema`
  (packages/shared/src/schemas/attachment.ts:28-53, yêu cầu serverId, trần
  `STICKER_FILE_BYTES = 512 KiB`); claim một-lần theo pattern `claimProfileAttachment`
  (attachments.service.ts:216-241); URL dài hạn đi sẵn qua `profileLink`/`profileRow`
  (:298-325, mọi scope ≠ message); worker `kinds` hiện chỉ 'image' — cần nhánh WebP động
  (`animated: true`) và mệnh đề dọn theo scope trong SQL worker (attachment-worker.ts:50-63).
- **Picker**: pattern TG.23 — tab + tìm `foldVi` + recent localStorage 24
  (features/emoji/components/emoji-picker.tsx:15-34); composer dynamic import (ADR-0058).
- **Render**: tin đính kèm ở message-item.tsx:95; khung "sticker đã bị xóa" theo pattern
  `replyTo.deleted` (:88); lightbox = PingModal (attachment-list.tsx); `prefers-reduced-motion`
  đã có trong globals.css.
- **Tài sản hệ thống**: đặt `apps/web/public/stickers/` (public/ chưa tồn tại; không bị
  .dockerignore loại → vào thẳng image web, không cần URL ký); giấy phép ghi
  `ASSETS_LICENSES.md` ở gốc (file .md không vào build context — chỉ là hồ sơ).
- **e2e**: API theo `attachments.e2e-spec.ts` + `bootApp`; browser theo `attachment.spec.ts`
  (setInputFiles + 2 context realtime) và `emoji.spec.ts`; IDOR: thêm route mới vào
  `ID_ROUTES` và cập nhật `toHaveLength(39)` (idor.e2e-spec.ts:24,528).
- **Seed**: gói hệ thống với id cố định `019c0000-…` theo pattern seed.ts/seed-demo.ts.

## Kế hoạch triển khai (khi OWNER duyệt ADR)

1. Migration expand: `Message.kind`, bảng `StickerPack`/`Sticker`, index cần thiết; shared schema
   `sticker.ts` (create/list DTO, mã lỗi `STICKER_LIMIT_REACHED`), bit `MANAGE_EXPRESSIONS`.
2. API: `POST /servers/:serverId/stickers` (upload+claim trong 1 transaction, trần 30 advisory
   lock), `GET /servers/:id/stickers` + gói hệ thống, `DELETE /stickers/:id`; gửi tin
   kind=sticker qua `POST /channels/:id/messages` (schema mở rộng); worker scope sticker.
3. Web: `features/stickers/` (api/hooks/cache-test), picker 3 tab + tìm, nút composer, render tin
   sticker + khung xóa, màn quản trị, i18n vi/en, `ASSETS_LICENSES.md`, seed gói hệ thống tự vẽ.
4. Kiểm chứng: test đỏ trước (schema + trần 30 + IDOR), full bộ lệnh chuẩn + e2e mới, evidence +
   ảnh picker/tin sticker, merge `--no-ff` + poll CI theo pattern phiên.

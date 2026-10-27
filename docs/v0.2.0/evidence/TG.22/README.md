# Evidence TG.22 — Sticker

- Ngày: 2026-10-28 (Asia/Saigon); nhánh `feat/tg22-stickers`; base `a0701ba`.
- Thiết kế: [ADR-0067](../../../adr/0067-sticker-packs-and-expressions.md) — OWNER duyệt trong phiên
  2026-10-27, triển khai trọn trong phiên 2026-10-28.

## Đã giao

**Model + shared** (commit `feat(shared)`):

- Bảng `StickerPack {id, serverId nullable (null = gói hệ thống), name, position}` và
  `Sticker {id, packId, name, tags text[], attachmentId unique, createdBy (cột trần như
Attachment.uploaderId), deletedAt, createdAt}`; `Message.kind String @default("text")` +
  `Message.stickerId FK SetNull` (index `stickerId` cho FK SetNull — cùng lý do `replyToId`).
  Migration expand `20261027174731_tg22_sticker_packs_and_expressions`, `migrate diff` no
  difference qua `migrate status`.
- Bit `MANAGE_EXPRESSIONS = 4096n` (KHÔNG cấp cho `@everyone`), ability `manage Sticker` /
  `view Sticker` (mọi member xem được picker) trong `defineAbilityFor`; mã lỗi
  `STICKER_LIMIT_REACHED`; `Limits.STICKERS_PER_SERVER = 30`; schema `sticker.ts`
  (createStickerSchema, StickerDto, StickerPackDto, MessageStickerPreview); scope upload
  `'sticker'` (bắt buộc serverId, trần riêng `STICKER_FILE_BYTES = 512 KiB`); `MessageDto.kind`
  - `MessageDto.sticker` phát qua mọi đường như `replyTo` (TG.1); payload `message.created`
    mang `kind` + preview.

**API** (commit `feat(api)`):

- `POST /servers/:serverId/stickers` — claim tệp scope 'sticker' đã `ready` (pattern
  `claimProfileAttachment` TG.7, một tệp một sticker) + tạo gói server ngầm + giữ trần 30 bằng
  advisory lock `sticker-server:<id>` (pattern trần ghim TG.3); **idempotent theo tệp** (quy tắc
  12): retry sau commit trả lại sticker cũ của đúng server, tệp gắn server khác không lộ.
- `GET /servers/:serverId/stickers` — gói hệ thống + gói server, sticker đã xóa không trả, URL ký
  một lượt cho cả trang (`stickerUrlsMany` — 1 truy vấn + N HMAC).
- `DELETE /stickers/:stickerId` — guard tra server qua `:stickerId` (AbilityGuard nhánh mới),
  soft-delete + audit `STICKER_DELETE` (quy tắc 11 — xóa tài nguyên người khác tạo) + phát hành
  tệp (`status 'deleting'`, worker dọn theo scope); gói hệ thống chặn xóa (403).
- Gửi tin: `POST /channels/:id/messages` nhận `stickerId` — schema chặn content không rỗng và
  chặn kèm attachment tin nhắn; service kiểm sticker còn sống + thuộc server của channel hoặc
  gói hệ thống (400 BAD_REQUEST, không lộ); tin sticker không sửa được (PATCH → 400); event
  `message.created` phát kèm preview đã ký URL (bản động + khung tĩnh, hạn 30 ngày, không ràng
  buộc người xem — nội dung member-facing theo ADR-0067).
- Worker: nhánh kiểm định riêng `validateStickerFile` — nhận PNG/WebP tĩnh + WebP động + APNG
  (file-type trả mime `image/apng` riêng), xuất WebP (động giữ nguyên khung, resize ≤512×512),
  từ chối **ảnh tĩnh > 512×512** và JPEG/SVG, luôn xuất thêm khung tĩnh (khung đầu) cho
  `prefers-reduced-motion`; SQL dọn dẹp thêm scope sticker (server mất) và **loại sticker hệ
  thống (serverId NULL) khỏi mọi nhánh dọn** — vòng đời theo seed.

**Web** (commit `feat(web)`):

- `features/stickers/`: api/hooks (`useStickers` staleTime 5 phút, invalidate khi tạo/xóa),
  `sticker-utils.ts` thuần (tìm không dấu tái dùng `foldVi` — tách từ emoji picker thành module
  riêng để test node được; recent localStorage 24, test 3 ca), picker 3 tab (Gần đây/Hệ
  thống/Của server) + lưới điều hướng mũi tên (pattern TG.23), dynamic import (ADR-0058).
- Composer: nút sticker cạnh emoji; **bấm sticker là gửi ngay** (tin `kind='sticker'`,
  optimistic kèm preview của sticker vừa chọn, retry giữ đúng sticker).
- Render: `StickerMessage` — ảnh ≤160px; `prefers-reduced-motion` đổi sang khung tĩnh
  (`thumbnail=1`, nghe thay đổi matchMedia qua effect); sticker đã xóa (hoặc tệp 404) → khung
  "Sticker đã bị xóa" (pattern `replyTo.deleted`) thay vì ảnh vỡ.
- Quản trị: `StickerManager` trong bề mặt quản trị theo ability `manage Sticker` — upload qua
  `useProfileUpload('sticker', serverId)` (mở rộng union scope), form đặt tên (prefill từ tên
  tệp) + thẻ, xóa có `PingPopconfirm`; nhóm quyền mới "Biểu cảm" trong trình sửa quyền; i18n
  vi/en đủ key (test bắt thiếu key pass); audit UI có nhãn `STICKER_DELETE`.

**Tài sản + seed** (commit `feat(assets)`):

- 10 sticker hệ thống tự vẽ: SVG nguồn `scripts/sticker-sources/*.svg` (hình học phẳng, tự viết)
  → `scripts/generate-stickers.mjs` (sharp của apps/api) → `apps/web/public/stickers/*.webp`
  512×512 (6,7–15,5 KB). Nguồn giấy phép: [ASSETS_LICENSES.md](../../../../ASSETS_LICENSES.md) ở
  gốc repo — tài sản gốc của dự án, không dùng bên thứ ba (ADR-0067).
- Seed idempotent: gói hệ thống `019c0000-…0001` ("Ping") + 10 Sticker/Attachment id cố định
  `019c0000-…01xx/02xx`, status `ready` + `boundAt` + copy file webp vào
  `<ATTACHMENT_STORAGE_DIR>/<attachmentId>.ready` (API phục vụ qua profileLink không cần worker).

## Bug thật e2e bắt được (đỏ trước, sửa sau)

1. **Worker claim nhầm sticker hệ thống**: SQL dọn dẹp coi attachment scope `sticker` với
   `serverId` NULL (gói hệ thống, seed tạo) là "server đã mất" → claim rồi crash
   `tx.server.findUnique({id: null})` (PrismaClientValidationError) — 8/11 ca đỏ đúng một lý do.
   Sửa: loại `scope='sticker' AND serverId IS NULL` khỏi TOÀN BỘ các nhánh dọn + guard
   `row.serverId !== null` trong `profileGone`. Chạy lại: 11/11 xanh.
2. **Picker render URL tương đối** (bắt được khi kiểm browser thật): `sticker.url` của API là
   đường dẫn tương đối `/api/v1/...` — picker dùng thẳng làm `src` nên trúng web origin (:3000)
   → ảnh vỡ; tin nhắn/quản trị đã đi qua `profileImageUrl` nên chỉ picker sai. Sửa: picker dùng
   `profileImageUrl(sticker.url)`.
3. **Seed thiếu khung tĩnh `.thumb`** (bắt khi kiểm reduced-motion thật): worker luôn xuất 2
   variant (`ready` + `thumb`) nhưng seed chỉ copy `.ready` — máy bật `prefers-reduced-motion`
   thì sticker hệ thống load previewUrl → 404 → `onError` → hiện nhầm khung "Sticker đã bị xóa".
   Sửa: seed copy cả `.thumb`; kiểm lại: sticker render đúng cả hai chế độ.

## Kiểm chứng hiện tại

| Hạng mục                          | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                       | **51/51** (thêm: scope sticker, refine tin sticker, ability manage/view Sticker)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| API unit                          | **209/209** (thêm `validateStickerFile` 6 ca: tĩnh ≤512, tĩnh quá to bị từ chối, WebP động giữ khung + preview tĩnh, APNG, JPEG/SVG bị từ chối, trần 512 KiB)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Web unit                          | **204/204** (thêm: optimistic sticker + upsert event sticker, sticker-utils tìm không dấu + recent)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| API e2e stickers                  | **11/11** (upload pipeline → claim, list, quyền member/outsider, JPEG bị từ chối, gửi tin sticker + chặn content, IDOR chéo server, gói hệ thống dùng được, PATCH tin sticker 400, trần 30 advisory + giải phóng chỉ tiêu sau xóa mềm, retry idempotent, xóa + preview deleted + audit STICKER_DELETE)                                                                                                                                                                                                                                                                                                                                |
| API e2e TOÀN BỘ                   | **288/288 pass, 35 file** (trước TG.22: 277/277, 34 file), 201 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| API e2e IDOR                      | **5/5** — `ID_ROUTES` 39 → **42** (3 route sticker), bảng tấn công thêm rival delete + member create                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Web e2e TOÀN BỘ                   | **39 pass / 3 flake / 1 skip (21,5 phút)** — 3 spec fail (`attachment`, `auth-and-shell`, `profile`) đều **pass khi chạy riêng (1,1 phút)**: flake rate-limit cuối run trên máy dev (pattern đã ghi ở TG.4/TG.7; CI chia 3 shard/3 IP nên là cổng xác nhận). `sticker.spec.ts` pass trong cả hai lần chạy.                                                                                                                                                                                                                                                                                                                            |
| Web e2e sticker                   | `sticker.spec.ts` **3/3 pass, chạy xanh 2 lần liên tiếp** (48–51 s): (a) picker 3 tab + gửi realtime 2 context (bob nhận tin không reload, poll `naturalWidth>0` ảnh ký thật); (b) tìm không dấu "cuoi" lọc đúng; (c) upload quản trị qua pipeline thật (worker spawn trong beforeAll) → gửi → xóa → tin cũ thành khung "đã xóa" sau invalidate; (d) `reducedMotion: 'reduce'` → ảnh render `thumbnail=1` (test tự lập sticker qua pipeline để không phụ thuộc seed). Flake đã gặp: POST tin sticker chậm 1,6 s khiến test xóa trước khi tin commit (race của test, không phải bug sản phẩm) — sửa bằng đợi response 2xx rồi mới xóa. |
| Lint / format / typecheck / build | pass toàn repo; `check:bundle` JS tải ban đầu **246.2 KB ≤ 450 KB** (picker dynamic import, không tăng đáng kể so với 246.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Migration                         | `migrate dev` apply + `migrate status` in sync; seed chạy lại nhiều lần idempotent (10 sticker hệ thống, tệp `.ready` + `.thumb` có trong storage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Ảnh kiểm browser thật (dev server, đăng nhập alice): [picker.png](picker.png) — picker tab
"Hệ thống" đủ 10 sticker tự vẽ; [sticker-message.png](sticker-message.png) — tin sticker gửi từ
picker hiển thị ≤160px với vạch "Tin mới"; [admin-sticker.png](admin-sticker.png) — mục Sticker
trong bề mặt quản trị (upload + trần 0/30 + trạng thái rỗng).

Lưu ý vận hành: API e2e/dev DB reset do checksum migration lệch (file trên disk khớp git —
checksum cũ trong `_prisma_migrations`), `migrate reset --force` + seed lại là dữ liệu tái tạo
được; không đụng migration đã merge.

## Giới hạn đã biết

- Sticker bị xóa không có event realtime riêng (ADR-0067 không yêu cầu): tab khác thấy khung
  "đã xóa" sau refetch/invalidate (xóa ở quản trị invalidate cache tin nhắn server đó) hoặc khi
  `<img>` lỗi 404 tự đổi khung.
- APNG được nhận ở kiểm định nhưng libvips bản hiện tại đọc APNG về khung tĩnh — sticker APNG
  sẽ thành WebP tĩnh (không mất tệp, chỉ mất chuyển động); khuyến nghị người upload dùng WebP
  động. Ghi nhận để cân nhắc ở TG.24 (emoji động).

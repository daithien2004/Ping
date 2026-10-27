# ADR-0067: Sticker theo gói và hàng đợi biểu cảm của server

Status: accepted — kế hoạch TG.22 được OWNER duyệt trong phiên 2026-10-27 (bắt đầu triển khai ngay trong phiên)
Date: 2026-10-27

## Context

TG.22 cần sticker: gói hệ thống do dự án cung cấp + gói của server; gửi dưới dạng tin
`kind=STICKER` không cần văn bản; picker có tab gần đây/hệ thống/server và tìm theo tên+tag;
tải lên qua pipeline TG.6 với quyền `MANAGE_EXPRESSIONS`, tối đa 30 sticker/server; xóa sticker →
tin cũ hiển thị khung "sticker đã bị xóa"; chuyển động tôn trọng `prefers-reduced-motion`.
ADR-0057 (emoji bằng font hệ thống) đã ghi rõ phần động/sticker thuộc TG.22.

## Decision

- **Model**: `StickerPack { id, serverId nullable (null = gói hệ thống), name, position }` và
  `Sticker { id, packId, name, tags text[], attachmentId unique, createdBy, deletedAt }`.
  Sticker tham chiếu `Attachment` bằng `Attachment.scope='sticker'` + `boundAt` (pattern TG.7);
  không FK tới server để metadata còn sau khi xóa server (dọn tệp theo scope như avatar).
- **Gửi tin**: thêm `Message.kind` ('text' mặc định | 'sticker') migration expand. Tin sticker =
  `kind='sticker'` + đúng 1 attachment scope 'sticker', `content` bắt buộc rỗng. `MessageDto.kind`
  phát qua mọi đường (list/create/retry/update) như `replyTo`. Event `message.created` mang sẵn.
- **Kiểm định sticker**: cho phép PNG/WebP tĩnh **và WebP động** (APNG chỉ nhận ở kiểm định,
  reencode về WebP động bằng sharp `animated: true`); giới hạn `STICKER_FILE_BYTES = 512 KiB`
  (tệp gốc) và kích thước xuất ≤ 512×512. Không nhận SVG/HTML. Worker từ chối ảnh tĩnh quá to.
- **URL phục vụ**: dùng đường profileLink (30 ngày, không ràng buộc người xem) — sticker là nội
  dung member-facing; picker/tin nhắn render bằng `<img>` không cần token theo người xem.
- **Quyền**: bit `MANAGE_EXPRESSIONS = 4096n`, KHÔNG mặc định cho `@everyone` (chỉ role được cấp);
  ability `manage Sticker` trong server. Gửi sticker cần `SEND_MESSAGES` như tin thường.
  IDOR: gửi/dùng chỉ sticker của server mình thuộc hoặc gói hệ thống (kiểm membership từ
  pack.serverId); quản lý cần `MANAGE_EXPRESSIONS` của server đó.
- **Trần**: 30 sticker/server giữ bằng advisory lock theo server (pattern trần ghim TG.3), vượt →
  `STICKER_LIMIT_REACHED` (mã mới trong `ErrorCodes`).
- **Gói hệ thống**: tài sản tự vẽ (SVG gốc → xuất WebP tĩnh ≤512px), đặt ở `apps/web/public/stickers/`
  (không rơi vào .dockerignore, vào thẳng image web, không cần URL ký), seed id cố định
  `019c0000-…`; nguồn giấy phép ghi trong `ASSETS_LICENSES.md` ở gốc repo (file không vào build
  context — chỉ là hồ sơ). Dev seed tạo 1 gói hệ thống với 8–12 sticker tự vẽ tối giản.
- **UI**: `features/stickers/` — picker 3 tab (gần đây localStorage 24 riêng / hệ thống / server)
  - tìm không dấu (`foldVi`, tái dùng `foldVi` của emoji); composer thêm nút sticker cạnh emoji,
    dynamic import (ADR-0058); tin sticker render ảnh ≤160px, `prefers-reduced-motion` → hiển thị
    khung đầu tiên (sharp xuất `preview` tĩnh khi có animation); xóa sticker → tin cũ render khung
    "sticker đã bị xóa" (pattern `replyTo.deleted`).
- **Quản lý sticker** trong bề mặt quản trị server (mục mới, theo quyền): danh sách + tải lên
  (drag/drop hoặc chọn tệp, dùng `useProfileUpload('sticker', serverId)`) + xóa có Popconfirm.
- **Metrics**: `dependency_up{attachment_storage}` đã có; không thêm nhãn mới (quy tắc 21).

## Alternatives

- Dùng attachment thường của tin nhắn (scope 'message'): mất gói/tag/trần 30/server và kiểm định
  riêng, loại.
- Lưu sticker ngoài pipeline (public directory cho sticker của server): vi phạm ADR-0053
  (không có bản sao công khai ngoài URL ký), loại. Gói hệ thống thì OK vì là tài sản của dự án.
- APNG giữ nguyên định dạng: thêm một nhãn mime nữa cần kiểm định riêng; WebP động thay thế được
  với kích thước nhỏ hơn, loại.

## Consequences

- `Message.kind` là cột mới thứ hai trên Message trong v0.2.0 (expand an toàn, rolling deploy ok).
- WebP động mở đường cho TG.24 (emoji tùy chỉnh động) tái dùng đúng nhánh kiểm định này.
- Gói hệ thống tự vẽ tốn công thiết kế ban đầu nhưng không rủi ro bản quyền; thêm gói sau chỉ là
  seed + tệp tĩnh mới.
- Nguồn API đối chiếu: sharp `animated` (phiên bản trong repo), kế hoạch TG.22 mục 6.2; kết quả
  chạy thật ở evidence TG.22.

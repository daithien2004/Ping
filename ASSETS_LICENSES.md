# Nguồn và giấy phép tài sản (ASSETS)

Hồ sơ này ghi rõ nguồn gốc, tác giả và giấy phép của mọi tài sản nhúng trong dự án Ping —
yêu cầu của ADR-0067 (TG.22) cho gói sticker hệ thống: "Gói hệ thống phải là tài sản tự vẽ
hoặc có giấy phép cho phép dùng lại; ghi nguồn trong ASSETS_LICENSES.md; không dùng sticker
bản quyền".

## Sticker hệ thống — `apps/web/public/stickers/*.webp`

| Thuộc tính | Giá trị                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Tác giả    | Dự án Ping (tự vẽ, original work)                                                              |
| Nguồn      | SVG gốc tại `scripts/sticker-sources/*.svg`, sinh bằng `scripts/generate-stickers.mjs`         |
| Ngày tạo   | 2026-10-28                                                                                     |
| Giấy phép  | Tài sản nội bộ của dự án Ping (project-internal original asset) — không sao chép từ bên thứ ba |
| Công cụ    | SVG viết tay (phần tử hình học cơ bản) → WebP 512×512 bằng sharp                               |

Không có sticker nào lấy từ nguồn bên ngoài (bộ emoji/mặt cười thương mại, Giphy, Tenor…).
Thêm gói hệ thống mới: vẽ SVG mới vào `scripts/sticker-sources/`, chạy lại script sinh WebP,
đăng ký trong seed (`apps/api/prisma/seed.ts`) và bổ sung dòng ở hồ sơ này.

## Tài sản khác

- Emoji (TG.23): dùng font hệ thống, không nhúng tệp ảnh nào — xem ADR-0057.
- Icon giao diện: `lucide-react` (giấy phép ISC, bundle trong dependency).

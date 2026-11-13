# ADR-0089: Bỏ skin Pixel và Pop, chỉ còn một skin mặc định

Status: accepted — OWNER yêu cầu trong phiên 2026-11-13.
Date: 2026-11-13

## Context

[ADR-0076](0076-skin-pixel-truc-hinh-thuc-thiet-bi.md) thêm trục `data-skin` độc lập sáng/tối cho
skin "Pixel" (chỉ đổi hình thức). [ADR-0084](0084-skin-pop-pop-art.md) thêm skin thứ ba "Pop"
(đổi cả màu, phong cách pop-art) trên cùng trục. OWNER quyết định bỏ cả hai, chỉ giữ giao diện mặc
định kiểu Discord.

Sau khi bỏ hai skin, hệ thống chỉ còn đúng một lựa chọn (`default`). Giữ lại cơ chế chọn/lưu skin
(cookie `ping-skin`, `data-skin` attribute, UI chọn trong Cài đặt > Giao diện, cờ build-time
`NEXT_PUBLIC_ENABLE_PIXEL_SKIN`) cho một lựa chọn duy nhất là thừa (YAGNI) — quyết định bỏ luôn
toàn bộ cơ chế, không chỉ hai giá trị trong danh sách.

## Decision

1. Bỏ `skins.pixel`, `skins.pop`, `palette.pop` khỏi `lib/theme/tokens.ts`; bỏ hẳn khái niệm
   `Skin`/`skinNames`/`skins` — `semanticColors()` không còn nhận tham số skin.
2. Xóa `lib/theme/skin.ts` (cookie, `parseSkin`, `readSkinCookie`, `writeSkinCookie`,
   `PIXEL_SKIN_ENABLED`) và `lib/avatar-tone.ts` (tông avatar chỉ dùng cho skin Pop).
3. Bỏ cờ build-time `NEXT_PUBLIC_ENABLE_PIXEL_SKIN` khỏi `lib/env.ts` và `.env.example`.
4. `providers/theme-provider.tsx`, `lib/theme/antd-theme.ts` bỏ nhánh/tham số theo skin.
5. `features/settings/store.ts` bỏ field `skin`; `features/settings/components/appearance-section.tsx`
   bỏ hẳn khối UI chọn skin.
6. Xóa `styles/skin-pop.css`, sinh lại `styles/tokens.generated.css` bằng `pnpm gen:theme`; bỏ phần
   sinh khối CSS theo skin trong `scripts/gen-theme-css.mjs`; `scripts/design-audit.mjs` chỉ còn đo
   theo mode (sáng/tối), không còn đo theo skin.
7. Xóa font `Montserrat` (`app/layout.tsx`, chỉ dùng cho tiêu đề skin Pop) và JSX/decor chỉ hiện ở
   skin Pop (`app/not-found.tsx`, `app/(public)/page.tsx`, `features/channels/.../channel-view.tsx`).
8. Xóa i18n key `skin`/`skinDefault`/`skinPixel`/`skinPop`/`skinHint` ở cả `messages/vi.json` và
   `en.json`.
9. Xóa toàn bộ test/e2e/visual riêng cho hai skin: `lib/theme/skin-pop-slots.test.ts`,
   `e2e/skin-pop.spec.ts`, `e2e/pages-pop.spec.ts`, `e2e/ui-kit-pop.spec.ts`, `e2e/pop-demo.ts`, case
   liên quan trong `e2e/settings.spec.ts`/`tokens.test.ts`/`ping-button.test.ts`; bỏ vòng lặp chụp
   theo skin trong `visual/visual.spec.ts`/`visual/auth.spec.ts` và 36 ảnh baseline `*-pixel.png`.

## Consequences

- Người dùng chưa có cookie skin trước đây mặc định thấy skin **Pop** (`readSkinCookie()` fallback
  `'pop'` khi không có cookie); sau thay đổi này mọi người dùng — cũ lẫn mới — chỉ còn thấy giao diện
  **default** (giống Discord gốc). Đây là thay đổi giao diện có chủ đích, OWNER đã xác nhận.
  Cookie `ping-skin` cũ trên trình duyệt người dùng (nếu có) không còn tác dụng.
- `data-skin`, `data-tone` không còn được set; mọi `data-slot` trang trí riêng của `skin-pop.css` còn
  sót trong markup một số component (nếu có) trở thành attribute chết, không có CSS nào đọc — không
  ảnh hưởng hành vi, chưa dọn triệt để vì chi phí tìm kiếm không tương xứng giá trị.
- [ADR-0076](0076-skin-pixel-truc-hinh-thuc-thiet-bi.md) và [ADR-0084](0084-skin-pop-pop-art.md) coi
  như bị thay thế bởi ADR này; giữ nguyên nội dung cũ làm lịch sử, không sửa lại.
- Cần làm thủ công: `.env.example` còn dòng `NEXT_PUBLIC_ENABLE_PIXEL_SKIN=true` (môi trường sandbox
  chặn sửa file này) — xóa cùng dòng comment phía trên khi có quyền.
- Chưa chạy bộ e2e/visual thật (cần Docker) để xác nhận sau khi xóa — cần chạy
  `pnpm --filter web test:e2e` và bộ visual trước khi coi là xong hẳn.

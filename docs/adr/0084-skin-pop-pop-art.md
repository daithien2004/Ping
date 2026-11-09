# ADR-0084: Skin "Pop" — skin thứ ba, phong cách pop-art, đổi màu theo mode

Status: proposed — chờ OWNER duyệt sau khi xem ảnh chụp thật.
Date: 2026-11-09

## Context

OWNER thích phong cách pop-art của uimaven.art (nền cam đặc, viền mực dày, bóng cứng, huy hiệu và
sticker) và muốn Ping có lựa chọn đó. [ADR-0076](0076-skin-pixel-truc-hinh-thuc-thiet-bi.md) đã dựng
trục `data-skin` độc lập với sáng/tối và ghi rõ: thêm skin thứ ba thì đi đúng đường này, không fork
component.

Khác Pixel (chỉ đổi hình thức, giữ màu), Pop phải **đổi cả màu**: cam/vàng/cobalt trên nền giấy kem.
Điều hướng khóa kéo và cảnh canvas của site gốc **không** đưa vào: Ping là app dùng cả ngày.

## Decision

1. **Thêm giá trị `pop` vào `skinNames`**, cùng trục `data-skin`, cùng cookie `ping-skin` và cùng cờ
   build-time `NEXT_PUBLIC_ENABLE_PIXEL_SKIN` (không thêm cờ mới). `parseSkin` nhận `pop`.
2. **`skins.pop` trong `tokens.ts`** khai: thang bo góc kiểu sticker (`full` giữ 9999 để avatar vẫn
   tròn), viền 2 px, bóng cứng (mực ở nền sáng, cam ở nền tối vì bóng đen không thấy trên nền tối) và
   **ghi đè một phần `SemanticColors` theo mode**. `semanticColors(mode, skin)` gộp phần ghi đè chỉ
   khi skin là `pop`; `default` và `pixel` giữ nguyên bảng gốc.
3. **Cam chỉ làm màu nhấn**: rail, nút chính, mục đang chọn. Vùng đọc tin nhắn giữ nền giấy (sáng)
   hoặc nền đêm ấm (tối). Chữ trên cam là chữ mực (5,66:1); chữ trắng trên cam chỉ ~3,5:1 nên không
   dùng.
4. **`gen-theme-css.mjs` sinh ba khối `html[data-skin='pop']`** (sáng, tối theo hệ điều hành, tối theo
   cài đặt) đặt sau khối Pixel; khối tối có độ đặc hiệu cao hơn khối sáng nên thắng như Pixel.
5. **antd nhận skin Pop** qua `buildAntdTheme(mode, skin)`: bo góc theo thang Pop, `lineWidth` 2,
   bóng cứng, màu từ `semanticColors(mode, 'pop')`. Nhánh `default` giữ nguyên từng giá trị.
6. **Luật viền Tailwind** trong `globals.css` đổi selector sang
   `html:is([data-skin='pixel'], [data-skin='pop'])` (cùng độ đặc hiệu như cũ).
7. **`audit:design`** đo tương phản token antd cho cả hai skin (`default`, `pop`) × hai mode. Kiểm
   "ba tầng nền" (rail tối nhất) chỉ áp cho skin mặc định: Pop cố ý để rail cam là mảng nổi nhất.
8. **Font hiển thị Montserrat 800** cho tiêu đề, ngày và tên người (nạp ở `app/layout.tsx`,
   `preload: false` nên skin mặc định không tốn thêm). Chọn Montserrat thay Jost vì Jost không có
   subset `vietnamese` (ADR-0076 điều 7 lo đúng điều này); nội dung vẫn dùng Geist.
9. **Lớp trang trí `src/styles/skin-pop.css`** (nhập từ `globals.css`, scope dưới
   `html[data-skin='pop']`, không hex, nằm ngoài `@layer` để thắng utility). Chi tiết: rail sọc vải và
   huy hiệu viền đôi, khóa kéo ở mép sidebar, tên server là bảng tên nghiêng, kênh đang chọn là sticker
   (antd tô `<a>` trong suốt bằng rule ngoài layer nên `bg-sidebar-accent` không hiện — đặt riêng cho Pop
   thay vì đổi skin mặc định), tin nhắn là bong bóng viền dày không đuôi, dải ngày là băng keo, reaction
   là sticker, nền chat có halftone, grain in ấn (SVG `feTurbulence` làm ô 160 px, `data:` đã nằm trong
   `img-src`), hiệu ứng "đóng dấu" 260 ms khi tin còn `sending` (reduced-motion tắt qua luật chung).
10. **Móc bám bằng `data-slot`**, không bám class Tailwind; danh sách đầy đủ nằm ở đầu
    `src/styles/skin-pop.css` (nguồn duy nhất, tránh ADR lệch), cùng `data-mine`, `data-tone`. Các
    thuộc tính này không đổi hình thức của skin khác. Hợp đồng được test (`skin-pop-slots.test.ts`):
    slot dùng trong CSS phải có ở component, bảng slot ở đầu file CSS phải khớp, CSS không chứa hex
    thô. Bóng cứng và màu skin sống ở `tokens.ts` (`--ping-shadow-hard`), CSS không tự khai màu.
    Popup antd (modal, tooltip, dropdown, popover, toast) qua portal nên bám class `.ant-*`.
11. **Bố cục riêng của Pop**: tin của mình căn phải nền vàng, bảng thành viên là bảng tin (ghi chú có
    ghim), tiêu đề kênh có nút vuông, composer là dock. Dải chủ đề chạy chữ **chưa làm** (chủ đề đã hiện
    ở tiêu đề kênh; thêm dải là thêm chuyển động liên tục, cần OWNER chốt).
12. **Điều chỉnh sau khi chạy axe** (e2e `skin-pop`): nút chính ghim cam và chữ mực cho cả ba trạng
    thái (darkAlgorithm làm cam xỉn); nền tối dùng accent trầm + chữ giấy thay vì vàng + mực; bóng
    `panel` ở nền tối là mực (thẻ đăng nhập nằm trên nền cam), `overlay` giữ cam.

## Consequences

- Giao diện mặc định và Pixel **không đổi**; Cài đặt > Giao diện có thêm một lựa chọn "Pop".
- Skin vẫn theo thiết bị, không đồng bộ tài khoản (ADR-0076).
- Visual regression: ảnh Pop chưa có baseline. Thêm ảnh hậu tố `-pop` là việc kế tiếp sau khi OWNER
  duyệt hình thức; không tự tạo baseline để che lỗi.
- Grain, sọc vải và minh họa tay của site gốc chưa làm: cần asset thật.
- Mọi component mới dùng token/`Ping*` tự nhận Pop; màu thô bị ESLint chặn nên không rò rỉ.

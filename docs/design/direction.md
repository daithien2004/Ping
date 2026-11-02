# Hướng thiết kế Ping v0.2.0 — "Expressive Social"

ADR: [0051](../adr/0051-design-direction.md). Owner chọn hướng "Expressive Social" kiểu Discord, và
ngày 2026-11-02 chốt **bám sát Discord**: lấy [Discord UI kit trên Figma](https://www.figma.com/design/qFSZpxlNYMr8mmuhyP3oGv/)
làm tham chiếu cấu trúc, đồng thời đo computed style trên Discord web thật (1280×800, DPR 1,
`theme-darker` + `visual-refresh`) ở cả hai theme.

## Palette (đo từ Discord web, 2026-11-02)

Nền tối:

- Rail + cột kênh: `#121214` (Discord dùng cùng một màu cho cả hai; Ping tách sidebar `#16161a`
  một bậc để cổng "ba tầng nền" còn phân biệt được).
- Vùng chat: `#1a1a1e`; surface phụ `#202024`; composer `#222327`; menu `#242429`.
- Chữ chính `#efeff1`; chữ phụ `#96979e`; link `#4d96ee`.
- Nhấn: blurple `#5865F2` (hover `#4752C4`), chữ trên nhấn là trắng.

Nền sáng:

- Rail `#f3f3f4`; cột kênh `#fbfbfb`; vùng chat `#ffffff`.
- Chữ phụ `#6c6d76`; link `#006dd4`; nhấn blurple `#5865F2`.

Màu trạng thái giữ nguyên bộ token cũ (`green-600`, `amber-500`, `red-400/600`), mỗi cặp chữ/nền
phải đạt AA — `audit:design` in ra từng tỉ lệ.

## Typography

- Sans: Geist (tự host qua next/font, có subset tiếng Việt). Mono: Geist Mono.
- Thang cỡ: 12/14/16/18/20/24. Line-height 1.2/1.5/1.7; mật độ tin nhắn dùng 1,375 (16/22).
- Tên người gửi 16/500, timestamp 12/500, nhãn nhóm kênh 14/500.

## Spacing & radius

- Spacing bội 4 px (4/8/12/16/20/24/32/40/48/64), cộng hai khung đo từ Discord:
  cột kênh 303 px (`--spacing-sidebar`), header 49 px (`--spacing-header`).
- Radius 8/12/16 px; hộp tin nhắn, danh sách kênh và composer dùng 8.

## Layout 4 cột (đo 1280×800)

- Rail server 72 px, icon 40×40, mục đang chọn có vạch dọc bên trái.
- Cột kênh 303 px; header server 49 px; dòng kênh cao 32 px, bo 8, đệm 4/8, chữ 16/500.
- Vùng chat: header 49 px, tiêu đề `#` 24 px, ô tìm kiếm 244×32; avatar tin nhắn 40 px, nội dung
  thụt 72 px, nhóm tin cách nhau 16 px.
- Panel thành viên 240 px (thu gọn được).
- Composer: rộng theo cột chat trừ 8 px mỗi bên, cao 57,6 px, nền `#222327`, viền trắng 12%.
- Cài đặt cá nhân: nav 232 px, cột nội dung tối đa 740 px (theo bố cục Discord visual refresh).
- Màn đăng nhập: nền blurple phủ kín viewport, thẻ trắng 448 px ở giữa.

## Motion

- ≤ 200 ms cho chuyển trạng thái; tôn trọng `prefers-reduced-motion`.

## Skin Pixel (tùy chọn, theo thiết bị)

Ngoài giao diện mặc định bám Discord, có skin thứ hai "Pixel" cho người thích chất ô bàn phím
([ADR-0076](../adr/0076-skin-pixel-truc-hinh-thuc-thiet-bi.md)): bo góc 0 (kể cả avatar/chấm trạng
thái), viền 2 px, bóng cứng không blur, chuyển động `steps(2, end)`. Màu và nhịp giữ nguyên — skin
không đổi palette. Chọn ở Cài đặt > Giao diện, lưu ở cookie thiết bị, không đồng bộ tài khoản.

Không dùng font pixel: Pixelify Sans không có subset tiếng Việt, dấu sẽ rơi về font hệ điều hành.
Cá tính Pixel đến từ hình khối, không từ chữ.

## Nguyên tắc

- Bảng màu/layout lấy Discord làm chuẩn; **logo, tên sản phẩm, sticker và tài sản hình ảnh vẫn là
  của Ping**, không sao chép nhận diện.
- Không gradient/glass/glow; nhấn màu chỉ cho nút chính, link, focus và trạng thái.
- Mọi component dùng token (`--ping-*` / theme antd); lint chặn hex/khoảng cách tùy ý.
- Biểu tượng đồng bộ (lucide-react). Giọng văn UI tiếng Việt.

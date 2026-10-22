# Hướng thiết kế Ping v0.2.0 — "Expressive Social"

ADR: [0051](../adr/0051-design-direction.md). Owner đã chọn hướng "Expressive Social" kiểu Discord.

## Palette (đề xuất, chờ Owner chốt biến thể)

- Nền tối đậm (primary surface): ink-950 `#171726`.
- Nền phụ: ink-900 `#212133`, ink-850 `#2a2a3d`.
- Màu nhấn rực: violet-500 `#7c5cff` (tối) / violet-600 `#6a4cff` (sáng).
- Thành công: green-600 `#2f9e6a`; cảnh báo: amber; lỗi: red-400 `#f07a6a`.
- Bản sáng: nền ink-50, nhấn violet-600; cùng chất lượng.

## Typography

- Sans: Geist (tự host qua next/font). Mono: Geist Mono.
- Thang cỡ: 12/14/16/18/20/24. Line-height 1.2/1.5/1.7.

## Spacing & radius

- Spacing bội 4 px (4/8/12/16/20/24/32/40/48/64).
- Radius 6/8/12/16 px (bo góc lớn ~12–16 cho card/panel).

## Layout 4 cột

- Rail server ~72 px.
- Channel sidebar ~240 px.
- Khung chat (flex).
- Panel thành viên ~240 px (thu gọn được).

## Motion

- ≤ 200 ms cho chuyển trạng thái; tôn trọng `prefers-reduced-motion`.

## Nguyên tắc

- Bảng màu/logo/biểu tượng riêng của Ping, không sao chép Discord.
- Gradient/hiệu ứng đạt tương phản AA.
- Mọi component dùng token (`--ping-*` / theme antd); lint chặn hex/khoảng cách tùy ý.
- Biểu tượng đồng bộ (lucide-react). Giọng văn UI tiếng Việt.

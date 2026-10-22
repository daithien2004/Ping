# ADR-0051: Hướng thiết kế và design token

Status: proposed — chờ OWNER duyệt
Date: 2026-10-22

## Decision

Hướng thiết kế đã được OWNER chọn: **"Expressive Social" kiểu Discord** — nền tối đậm, màu nhấn rực,
bo góc lớn (~12–16 px), avatar lớn, chuyển động giàu cá tính. Agent chỉ đề xuất 2–3 biến thể
palette/typography **trong hướng này** để OWNER chốt. Bản sáng là bản phụ nhưng cùng chất lượng.

Nguyên tắc:

- Bảng màu, logo và biểu tượng **riêng của Ping**, không sao chép tài sản/nhận diện của Discord.
- Gradient/hiệu ứng vẫn đạt tương phản AA, tôn trọng `prefers-reduced-motion`, không làm tụt hiệu năng.
- Lưới 4 cột: rail server ~72 px, channel ~240 px, khung chat, panel thành viên ~240 px (thu gọn được).
- Chuyển động ≤ 200 ms, tôn trọng `prefers-reduced-motion`.
- Bộ biểu tượng đồng bộ; giọng văn UI tiếng Việt.
- Nguồn token duy nhất tại `apps/web/src/lib/theme/`: màu, typography, spacing 4/8 px, radius,
  elevation, motion, z-index. Ánh xạ sang theme antd và CSS variables cho component tự dựng.
- Font tự host.

## Token

Xem `apps/web/src/lib/theme/tokens.ts` (được tạo trong T0.7). Token được ánh xạ sang:

- `ConfigProvider` của antd (theme sáng/tối qua thuật toán).
- CSS variables (`--ping-*`) cho component tự dựng và Tailwind.

## Alternatives

- Hướng tối giản/flat: ít cá tính, khó khác biệt trong phỏng vấn.
- Hướng Material: xa với cộng đồng chat, không khớp "Expressive Social".

## Consequences

- Đổi 1 token → antd và component tự dựng cùng đổi.
- Lint chặn hex/khoảng cách tùy ý ngoài token.
- `docs/design/direction.md` lưu palette, typography, ví dụ màn hình (sẽ bổ sung khi có mock).
- Case study frontend dùng ảnh trước/sau theo hướng này.

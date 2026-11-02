# ADR-0051: Hướng thiết kế và design token

Status: accepted — OWNER duyệt ngày 2026-10-22
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

## Cập nhật 2026-11-02 — bám sát Discord

**Bối cảnh.** OWNER dừng PR nền UI vì giao diện "chưa thật sự bám sát UI Discord", cấp link
[Discord UI kit (Figma)](https://www.figma.com/design/qFSZpxlNYMr8mmuhyP3oGv/) và phiên đăng nhập
Discord thật để đo.

**Quyết định.**

- Màu nhấn đổi từ violet-600 `#6558e0` sang **blurple `#5865F2`** (hover `#4752C4`) ở cả hai theme.
  Chữ trắng trên `#5865F2` = **4,61:1**, vẫn đạt AA; đậm hơn brand-600 của Discord sẽ lệch màu.
- Bề mặt lấy đúng mã đo từ Discord web: rail/cột kênh `#121214`, chat `#1a1a1e`, composer `#222327`;
  bản sáng rail `#f3f3f4`, cột kênh `#fbfbfb`, chat `#ffffff`. Riêng sidebar tối giữ `#16161a`
  (Discord dùng cùng `#121214` cho rail và sidebar) để cổng ba tầng nền còn phân biệt được.
- Khung đo thành token Tailwind: cột kênh **303 px**, header **49 px**, ô tìm kiếm **244×32**,
  avatar tin nhắn **40 px**, thụt nội dung **72 px**, nhóm tin cách **16 px**, composer cao
  **57,6 px**. Cài đặt cá nhân: nav **232 px**, cột nội dung tối đa **740 px** (theo bố cục
  visual refresh của Discord).
- Màn đăng nhập theo dạng nền blurple phủ kín + thẻ trắng giữa màn hình.

**Hệ quả.** Toàn bộ 36 ảnh baseline `win32` phải sinh lại; baseline `linux/` xoá để job `visual`
bootstrap lại theo [ADR-0074](0074-visual-regression-baselines-va-ci.md). Logo, tên sản phẩm và tài
sản hình ảnh vẫn của Ping — chỉ bảng màu, khung và mật độ lấy Discord làm chuẩn.

Số liệu và nguồn: [ui-system §3](../design/ui-system.md), evidence `v0.2.0/evidence/UI-foundation`.

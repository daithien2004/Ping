# ADR-0075: Một nguồn token duy nhất, sinh CSS lúc build, chỉ còn lớp `Ping*`

Status: accepted — trong phạm vi PR1 của kế hoạch UI (OWNER duyệt ngày 2026-11-01), thi công phiên
2026-11-01.
Date: 2026-11-01

## Context

Trước ADR này, token giao diện tồn tại **hai nơi**: `apps/web/src/lib/theme/tokens.ts` (antd đọc)
và bảng oklch viết tay trong `apps/web/src/app/globals.css` (Tailwind đọc). Hai nguồn đã lệch
nhau ở những chỗ mắt thường khó thấy nhưng cộng lại thành giao diện "lệch 1–2 px":

- nền sáng: `#ffffff` (globals) vs ink-50 (tokens.ts); rail sáng ink-200 vs ink-950;
- `radius.lg = 12 px` cho antd trong khi `rounded-lg` của Tailwind ra 8 px — cùng một thẻ card
  nhưng hai bán kính, cùng một radius "lg" nhưng hai nghĩa;
- độ đậm chữ, bóng đổ, đường cong chuyển động, focus ring mỗi nơi một kiểu
  (`font-bold` lẫn `font-semibold`, `shadow-md`/`shadow-xl`, `ring-2`/`ring-3`).

Song song, hai bộ component cùng tồn tại: 9 module shadcn/Radix trong `components/ui/` và 33
wrapper `Ping*` bọc antd. Mỗi bộ có radius, bóng và focus riêng, nên hai hộp thoại cùng loại
không giống nhau. ADR-0050 đã chốt hướng "antd bọc sau `Ping*`" nhưng chưa có bước dọn bộ
shadcn; ADR-0023 ghi lại lựa chọn shadcn thời v0.1.0 và nay không còn đúng một phần.

Các cổng kiểm hiện có (ESLint, axe, visual regression) bắt được lỗi tương phản và lỗi ảnh,
nhưng không bắt được "hai nguồn token lệch nhau" hay "một chỗ dùng bậc đậm ngoài thang".

## Decision

1. **`src/lib/theme/tokens.ts` là nguồn duy nhất.** Mọi màu, palette, radius, bóng, easing, thang
   độ đậm, spacing, typography, motion, z-index khai ở đó. Không file CSS nào được viết lại giá
   trị đó bằng tay.
2. **Sinh CSS lúc build.** `apps/web/scripts/gen-theme-css.mjs` đọc token và ghi
   `src/styles/tokens.generated.css`; `predev`/`prebuild` chạy sinh, CI chạy `--check` và đỏ nếu
   file sinh lệch token. File sinh dùng tiền tố `--ping-` cho các biến trùng tên khoá theme của
   Tailwind (`--ping-radius-*`, `--ping-shadow-*`, `--ping-ease-*`, `--ping-weight-*`) để tránh
   tự tham chiếu; `globals.css` nối chúng vào `@theme inline`.
3. **Thang radius đọc thẳng token**: `rounded-lg` = 12 px khớp `borderRadiusLG` của antd. `2xl`/
   `3xl` (14/18 px) cố ý không suy ra từ `lg` — giữ dáng squircle của icon server 48 px.
4. **Chỉ còn lớp `Ping*`.** 9 module shadcn/Radix bị xoá; gói `radix-ui`,
   `class-variance-authority`, `shadcn`, `tw-animate-css` bị gỡ khỏi `apps/web/package.json`.
   `cn` (gói `cn` v0.4.0, gộp clsx + tailwind-merge) được giữ vì còn dùng cho layout. `components.json`
   của CLI shadcn bị xoá. ESLint cấm import `radix-ui`, `@radix-ui/*`, `shadcn`,
   `class-variance-authority` ở mọi file `src/**` nên bộ thứ hai không quay lại qua đường import.
   ADR-0023 hết hiệu lực ở phần UI kit; ADR-0050 vẫn là quyết định nền.
5. **Ba bậc độ đậm, không hơn**: `normal 400 / medium 500 / semibold 600`, sinh thành
   `--font-weight-*`. `font-bold`, `font-black`, `font-light`, `font-thin` bị audit chặn.
6. **Ranh giới điều khiển phải ≥ 3:1.** `border` (1,34:1 sáng / 2,30:1 tối) chỉ dùng làm đường
   phân cách trang trí; viền ô nhập/select/checkbox dùng `borderStrong` (và `input` trỏ cùng màu),
   antd ghim `colorBorder = borderStrong`. Audit coi cặp `ring`, `input`, `sidebar-primary` là
   kiểm tra cứng, không miễn trừ.
7. **Một focus ring**: utility `focus-ring` trong `globals.css` (2 px `--ring`, offset 2 px) thay
   cho `ring-2`/`ring-3` rải rác. Một đường cong chuyển động `--ease-standard` làm mặc định cho
   mọi `transition-*`; hai mức bóng `panel`/`overlay`.
8. **Ba tầng nền đo được**: rail tối nhất → sidebar → mặt phẳng nội dung, giữ đúng thứ tự ở cả
   hai nền; unit test và `audit:design` cùng kiểm, đảo thứ tự hoặc hai tầng bằng nhau là đỏ.
9. **Audit là cổng CI**: `pnpm --filter web audit:design` chạy trong job `verify` khi vùng web
   đổi. Nó đo mọi cặp màu ở cả hai nền, kiểm lưới 4 px, sàn chữ 12 px, thang độ đậm, tầng nền,
   cấm hex ngoài allowlist và `!important` ngoài `globals.css`.

## Consequences

- Đổi một token là đổi toàn hệ; nhưng mọi chỗ đổi màu/bo góc/khoảng cách đều phải chạy lại
  `gen:theme` và commit file sinh — CI đỏ nếu quên.
- Ảnh baseline visual đổi gần như toàn bộ sau PR1 (radius, viền ô nhập, nhịp tin nhắn, khung
  composer, danh sách kênh). Quy trình cập nhật vẫn theo ADR-0074: xoá baseline nền tảng, cập
  nhật, **mở ảnh diff duyệt từng ảnh**, commit tách đôi code/ảnh.
- Không còn đường "thêm component shadcn" — thành phần mới phải bọc antd thành `Ping*` hoặc nêu
  ADR mới. Đây là chủ đích: một bộ component, một thang thiết kế.
- Audit đọc token bằng Node type-stripping (`node scripts/design-audit.mjs`), không cần build
  Next; chạy ~1 giây nên nằm được trong mọi PR.

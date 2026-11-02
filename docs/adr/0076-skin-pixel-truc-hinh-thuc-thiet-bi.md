# ADR-0076: Skin "Pixel" — trục hình thức thứ hai, chọn theo thiết bị

Status: accepted — trong phạm vi PR2 của kế hoạch UI (OWNER duyệt ngày 2026-11-02), thi công phiên
2026-11-02.
Date: 2026-11-02

## Context

PR1 ([ADR-0075](0075-single-token-source-va-lop-ping.md)) đưa giao diện về một nguồn token và bám
Discord. Ngay sau đó OWNER muốn thêm một skin thứ hai **"Pixel"** như lựa chọn cá nhân: bo góc 0,
viền dày, bóng cứng, chuyển động bậc thang — trong khi giao diện mặc định giữ nguyên.

Các ràng buộc khiến đây không phải "đổi vài biến CSS":

- **Tiếng Việt là ngôn ngữ chính.** Font pixel phổ biến (Pixelify Sans) không có subset `vietnamese`;
  dùng nó thì dấu tiếng Việt rơi về font hệ điều hành, vừa lệch chữ vừa vỡ baseline ảnh.
- **Mặc định không được đổi.** Visual regression so pixel từng ảnh; Pixel phải là lớp cộng thêm,
  không rò rỉ sang giao diện mặc định.
- **Không mở rộng API.** `PATCH /users/me/settings` chỉ nhận các trường đã khai trong `@ping/shared`
  và mọi trường đều đồng bộ server. Skin là sở thích **của thiết bị** (cùng một người có thể thích
  Pixel trên laptop nhưng không trên điện thoại), nên thêm cột DB + migration chỉ để chọn hình thức
  là cái giá không cần thiết.

## Decision

1. **Trục độc lập `data-skin` trên `<html>`**: `default` | `pixel`, vuông góc với `data-theme`
   (sáng/tối), `data-density` và `data-font`. Mọi quy tắc hình thức của Pixel bị scope dưới
   `html[data-skin='pixel']`, nên không có attr = không đổi gì.
2. **Token mở rộng, không nhân bản**: `skins.pixel` trong `tokens.ts` khai `radius = 0`,
   `borderWidth = 2`, bóng cứng cho cả hai nền, `easing = steps(2, end)`. `gen-theme-css.mjs` sinh
   khối `html[data-skin='pixel']` **sau** các khối theme để thắng cascade ở cùng độ đặc hiệu, kèm
   hai khối bóng tối (media query + `data-theme='dark'`). Bo góc `full` cũng về 0: avatar và chấm
   hiện diện thành ô vuông — đúng chất pixel, là chủ đích chứ không phải sót.
3. **Viền Tailwind đọc token**: `:root` có `--ping-border-width: 1px`; Pixel đặt 2 px. `globals.css`
   thêm luật **ngoài layer** cho `.border`, `.border-t/r/b/l/x/y` đọc biến này (utility của Tailwind
   hard-code 1 px và nằm trong layer), chọn từng cạnh để không phá phần tử chỉ có `border-t`.
   Không dùng `!important`.
4. **antd nhận skin qua tham số**: `buildAntdTheme(mode, skin = 'default')`. Với `pixel`, bo góc về
   0 ở mọi token `borderRadius*`/component, `lineWidth = 2`, `boxShadow*` là bóng cứng. Nhánh
   `default` giữ nguyên từng giá trị cũ — unit test chốt điều này.
5. **Skin thuộc thiết bị, lưu ở cookie `ping-skin`** (1 năm, `SameSite=Lax`, không HttpOnly vì không
   có dữ liệu nhạy cảm). Store đọc cookie lúc khởi tạo, `apply` ghi cookie và **không** đưa `skin`
   vào cache localStorage của cài đặt server; không PATCH, không migration, không đồng bộ đa thiết bị.
   Không đọc cookie ở server (cacheComponents bắt `cookies()` kéo cả cây vào `<Suspense>` —
   ADR-0022): `ThemeProvider` gắn `data-skin` ngay sau hydrate, cùng cơ chế đang dùng cho theme.
6. **Cờ build-time `NEXT_PUBLIC_ENABLE_PIXEL_SKIN`** (mặc định bật, đọc qua `lib/env.ts`): build với
   `false` để ẩn lối chọn trong Cài đặt > Giao diện. Lớp CSS và cookie vẫn tồn tại; cờ chỉ gác UI.
7. **Không dùng font pixel**: typography giữ Geist (đủ subset tiếng Việt). Cá tính Pixel đến từ hình
   khối — bo góc, viền, bóng, nhịp chuyển động — không từ chữ.
8. **Visual regression chụp cả hai lớp**: tên ảnh mặc định giữ nguyên, ảnh Pixel thêm hậu tố
   `-pixel` (5 màn + login) × 2 theme × 3 viewport = **72 ảnh mỗi nền tảng** (ADR-0074). Skin đặt qua
   cookie trước lần tải trang đầu.

## Consequences

- Giao diện mặc định **không đổi** về CSS/antd (đã có unit test + scope `[data-skin='pixel']`), nhưng
  **trang Cài đặt > Giao diện có thêm một hàng "Skin"** nên ảnh `settings-*` của baseline mặc định
  đổi đúng ở hàng đó; các màn còn lại chỉ đổi vì PR1.
- Skin không theo tài khoản: đổi máy/trình duyệt phải chọn lại. Đây là đánh đổi có chủ đích để tránh
  migration + đồng bộ cho một lựa chọn hình thức.
- Mọi component mới dùng token/`Ping*` là tự động nhận Pixel; nếu thêm skin thứ ba, làm đúng đường
  này (một trục `data-skin`, một khối token) chứ không fork component.
- Bóng cứng và viền 2 px làm thay đổi nhẹ kích thước hộp ở vài chỗ (viền tính vào layout); chấp nhận
  vì là skin phụ, và ảnh baseline Pixel ghi lại trạng thái đã duyệt.

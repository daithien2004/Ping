# Evidence PR2 "skin Pixel" — trục hình thức thứ hai, chọn theo thiết bị

- Ngày: 2026-11-02 (Asia/Saigon); nhánh `feat/ui-foundation`; PR2 chốt cùng PR1 (token/theme là
  file dùng chung nên hai phần code đi chung một commit), ảnh baseline là commit riêng.
- Phạm vi: skin "Pixel" ([ADR-0076](../../../adr/0076-skin-pixel-truc-hinh-thuc-thiet-bi.md)) — bo
  góc 0, viền 2 px, bóng cứng, chuyển động bậc thang; mặc định không đổi.
- Tài liệu thiết kế: [direction.md](../../../design/direction.md) (mục Skin), [ui-system.md](../../../design/ui-system.md) §3.3–3.4.
- Môi trường: máy dev Windows; e2e production `E2E_PRODUCTION=1`, `workers=1`.

## Đã giao

**Một trục skin, dùng lại toàn bộ token**

- `skins.pixel` trong `tokens.ts`: `radius 0` (gồm `full`), `borderWidth 2`, bóng cứng cho hai nền,
  `easing: steps(2, end)`. `gen-theme-css.mjs` sinh khối `html[data-skin='pixel']` sau các khối theme,
  cộng hai khối bóng tối (media query + `data-theme='dark'`).
- `--ping-border-width` (1 px mặc định, 2 px khi Pixel); `globals.css` thêm luật ngoài layer cho
  `.border`, `.border-t/r/b/l/x/y` đọc biến — utility Tailwind hard-code 1 px và nằm trong layer.
- `buildAntdTheme(mode, skin = 'default')`: Pixel đặt mọi `borderRadius*` về 0, `lineWidth 2`,
  `boxShadow*` là bóng cứng; nhánh mặc định giữ nguyên (unit test chốt).

**Chọn theo thiết bị, không mở rộng API**

- Cookie `ping-skin` (1 năm, `SameSite=Lax`), store đọc lúc khởi tạo và ghi khi đổi; `skin` bị loại
  khỏi cache `localStorage` của cài đặt server. Không PATCH, không migration, không đồng bộ tài khoản.
- `ThemeProvider` gắn `data-skin` và truyền skin vào antd; trang Cài đặt > Giao diện có hàng "Skin"
  (testid `settings-skin-default`/`settings-skin-pixel`), gác bởi cờ build-time
  `NEXT_PUBLIC_ENABLE_PIXEL_SKIN` (mặc định bật, đọc qua `lib/env.ts`).
- Không dùng font pixel: Pixelify Sans thiếu subset tiếng Việt; typography giữ Geist.

**Kiểm chứng tự động**

- Unit test mới: sinh đủ radius 0/viền 2 px/easing bậc thang/bóng cứng; antd Pixel bo 0 + `lineWidth`
  - bóng cứng nhưng giữ màu; nhánh mặc định không đổi; `parseSkin` chỉ nhận `default`/`pixel`.
- `e2e/settings.spec.ts` thêm bước (a2): bật Pixel → `data-skin`, `--ping-radius-lg` = 0 px, cookie
  đúng, tải lại giữ Pixel, trả về mặc định (12 px). Không có PATCH nào cho skin.
- Visual regression: mỗi tổ hợp chụp hai lớp; ảnh mặc định giữ tên cũ, ảnh Pixel thêm `-pixel`
  (72 ảnh/nền tảng; `login` cũng có bản Pixel).

## Kiểm chứng

| Hạng mục                                    | Kết quả                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit theme (`src/lib/theme/tokens.test.ts`) | **10/10** — gồm 4 test skin Pixel                                                                                                                                                                                                                                      |
| `audit:design`                              | **"Tất cả kiểm tra cứng đều đạt"**: 282 file quét; hex ngoài allowlist 0; `!important` ngoài `globals.css` 0; px/rem tuỳ ý ngoài thang 0; độ đậm ngoài thang 0 (semibold=56, medium=53, normal=1); tầng nền giữ nguyên thứ tự ở hai nền                                |
| `gen:theme --check`                         | **khớp** — file sinh từ token, có khối `html[data-skin='pixel']`                                                                                                                                                                                                       |
| Lint / typecheck / prettier                 | lint **0 error / 14 warning cũ**; `typecheck` sạch; prettier sạch trên file đã đổi                                                                                                                                                                                     |
| Web unit (toàn bộ)                          | **288/288** (33 file) — 4 test skin mới                                                                                                                                                                                                                                |
| Web e2e production (gồm bước skin)          | **62 passed, 1 skipped, 0 failed** (21,9 phút) — cùng lượt full với PR1 trên DB sạch; bước (a2) ở `e2e/settings.spec.ts` bật Pixel → `data-skin`, `--ping-radius-lg` = 0 px, cookie đúng, tải lại giữ Pixel, trả về mặc định. Skip: `local-deployment` cần HTTPS local |
| Visual regression (72 ảnh × platform)       | **72/72 khớp** (win32): 36 mặc định + 36 Pixel sinh cùng lượt (`test:visual:update`, 24 test, 4,5 phút), xác nhận bằng lượt chạy không update (**24 passed, 4,3 phút**)                                                                                                |
| `check:bundle` / build                      | JS tải ban đầu **248,2 KB** gzip (8 chunk), tải theo yêu cầu **811,7 KB** (77 chunk), tổng tham khảo **1060,0 KB**; ngân sách **≤450 KB** đạt — skin chỉ thêm CSS/attr, không thêm chunk                                                                               |

## Lưu ý / quyết định

- **Mặc định không đổi hình thức**: mọi luật Pixel nằm dưới `html[data-skin='pixel']`; nhánh antd
  mặc định giữ nguyên giá trị. Trang Cài đặt > Giao diện có thêm hàng "Skin" nên ảnh
  `settings-*` của baseline mặc định đổi đúng ở hàng đó; các màn còn lại chỉ đổi vì PR1.
- **Avatar/chấm trạng thái vuông** khi bật Pixel là chủ đích (bo `full` cũng về 0), không phải lỗi.
- **Nháy skin sau hydrate**: không đọc cookie ở server (ADR-0022 cấm `cookies()` ngoài `<Suspense>`),
  nên người dùng Pixel có thể thấy một khung hình mặc định khi tải trang — cùng mức với theme.
- **Skin không theo tài khoản**: đổi máy phải chọn lại; đổi lại là đánh đổi để tránh migration và
  thêm trường vào API settings.
- **Hai commit**: (a) code/token/test/docs của PR1+PR2 (dùng chung `tokens.ts`, `antd-theme.ts`,
  `theme-provider.tsx` nên không tách hunk được), (b) ảnh baseline `win32` 72 ảnh. OWNER duyệt chốt
  2026-11-02 — merge `--no-ff` vào `main` và push cùng lượt. Bộ `linux` cũ (UI trước PR1) đã xoá;
  CI bootstrap lại theo ADR-0074.

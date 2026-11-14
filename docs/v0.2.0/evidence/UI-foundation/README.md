# Evidence PR1 "nền UI" — một nguồn token, lớp `Ping*`, giao diện bám Discord

- Ngày: 2026-11-02 (Asia/Saigon); nhánh `feat/ui-foundation`; base `ca622f3`.
- Phạm vi: Pha 0.1/0.2/0.4, 1.1–1.5, 2.1–2.6, 5.1–5.4, 7.1–7.6 của kế hoạch UI (PR1 — nền UI),
  cộng đợt "bám sát Discord" cùng ngày: palette blurple, bề mặt và khung đo từ Discord web thật
  (1280×800, DPR 1, `theme-darker` + `visual-refresh`), ở cả hai theme.
- [ADR-0075](../../../adr/0075-single-token-source-va-lop-ping.md): một nguồn token duy nhất, sinh
  CSS lúc build, chỉ còn lớp `Ping*`. [ADR-0051](../../../adr/0051-design-direction.md) có mục
  cập nhật 2026-11-02 ghi lại việc đổi sang blurple + số đo Discord.
- Tài liệu thiết kế: [direction.md](../../../design/direction.md) (palette/typography/bố cục đo
  được), [ui-system.md](../../../design/ui-system.md) (§3 token, §4 lớp component, §6 các cổng).
- Môi trường: máy dev Windows (baseline `win32`); e2e production chạy với `E2E_PRODUCTION=1`,
  workers=1.

## Đã giao

**Một nguồn token**

- `apps/web/src/lib/theme/tokens.ts` là nguồn duy nhất; `apps/web/scripts/gen-theme-css.mjs` sinh
  `apps/web/src/styles/tokens.generated.css` với biến `--ping-*`; `predev`/`prebuild` chạy sinh.
  Cổng CI `gen:theme --check` đỏ nếu file sinh lệch token.
- Thang radius đọc thẳng token: `rounded-lg` = 12 px khớp `borderRadiusLG` của antd.
- Gỡ bộ component thứ hai: xoá 9 module shadcn/Radix, `components.json` và dependency radix/CVA
  khỏi `apps/web/package.json`; `src/components/ui/` chỉ còn 34 file `Ping*`. ESLint cấm import
  radix/CVA ở mọi file `src/**` và cấm `import 'antd'` ngoài lớp UI.

**Bám Discord (đo 1280×800, DPR 1)**

- Rail 72 px (icon 40×40, vạch chọn bên trái); cột kênh 303 px; header 49 px; dòng kênh 32 px;
  tìm kiếm 244×32; avatar tin nhắn 40 px, nội dung thụt 72 px, nhóm tin cách 16 px.
- Bề mặt tối: rail/sidebar `#121214` (Ping tách sidebar `#16161a` để cổng ba tầng nền còn phân
  biệt), chat `#1a1a1e`, composer `#222327`, menu `#242429`. Sáng: rail `#f3f3f4`, sidebar
  `#fbfbfb`, chat `#ffffff`.
- Nhấn blurple `#5865F2` ở cả hai theme (chữ trắng 4,61:1). Link `#006dd4` (sáng) / `#4d96ee`
  (tối). Composer cao 57,6 px, bo 8, đệm 10. Cài đặt cá nhân: nav 232 px, cột nội dung tối đa
  740 px. Đăng nhập: nền blurple phủ kín viewport, thẻ trắng 448 px.
- Kênh dùng `text-base` 16 px; tin nhắn line-height 1,375 (16/22); tên người gửi 16/500, timestamp
  12/500.

**Token hoá phần còn thiếu**

- Màu trạng thái `success`/`warning`/`info` vào token, map cho Tag/Presence/Alert; sàn chữ 12 px;
  viền điều khiển ≥3:1; hai mức bóng cho lớp nổi; focus 2 px + offset 2 px; easing chung; thang độ
  đậm 400/500/600.

**Polish màn chat**

- Nhóm tin theo người gửi: cùng tác giả ≤5 phút ẩn header, `padding-top` 2 px trong nhóm, 12 px
  giữa nhóm (compact 8 px), dải phân cách cho ngày mới.
- Composer `bg-card` + viền `border` + radius 8 + đệm 10; focus-within đổi viền `primary` + ring.
- Trạng thái rỗng/skeleton có chỗ đứng: skeleton khớp nhịp tin nhắn, empty state có icon, một câu
  giải thích và một nút hành động.

**Tài liệu và cổng CI**

- `/dev/ui` (chỉ dựng khi `next dev`) liệt kê đủ 34 wrapper `Ping*`.
- `docs/design/direction.md` viết lại theo số đo Discord; `ui-system.md` cập nhật bảng token, nhịp
  thị giác và ghi chú "CSS antd unlayered / màu link do antd sinh".
- `audit:design` là cổng CI trong job `verify` khi vùng web đổi.

## Kiểm chứng

| Hạng mục                                                      | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit                                                      | **284/284** (33 file)                                                                                                                                                                                                                                                                                                                                                                                                     |
| `audit:design`                                                | **"Tất cả kiểm tra cứng đều đạt"**: 281 file quét; hex ngoài allowlist 0; `!important` ngoài `globals.css` 0; px/rem tuỳ ý ngoài thang 0; import antd ngoài lớp UI 0; icon ngoài lucide 0; độ đậm ngoài thang 0 (semibold=56, medium=52, normal=1); tầng nền sáng 0,897 → 0,965 → 1,000 và tối 0,006 → 0,008 → 0,011. `--border` chỉ là đường phân cách (1,34:1 sáng / 1,53:1 tối) — audit ghi chú, không tính là vi phạm |
| `check:bundle`                                                | JS tải ban đầu **248,2 KB** gzip (8 chunk), tải theo yêu cầu **811,0 KB** (77 chunk), tổng tham khảo **1059,2 KB**; ngân sách **≤450 KB**                                                                                                                                                                                                                                                                                 |
| API unit/e2e                                                  | Unit **307/307** (41 file); e2e **365/365** (43 file, 184,51 s) — API không đổi nguồn trong PR này                                                                                                                                                                                                                                                                                                                        |
| Web e2e production (lượt full cuối, `workers=1`)              | **62 passed, 1 skipped, 0 failed** (21,9 phút; `E2E_PRODUCTION=1`, DB sạch `ping_e2e_clean` vừa `migrate deploy` + `db seed`). Skip: `local-deployment` cần HTTPS local (không bật trên máy này)                                                                                                                                                                                                                          |
| Visual regression (72 ảnh × platform: 36 mặc định + 36 Pixel) | **72/72 khớp** (win32): sinh bằng `test:visual:update` (24 test × 3 viewport × 2 theme × 2 skin, 4,5 phút) rồi xác nhận bằng lượt chạy không update (**24 passed, 4,3 phút**), trên DB sạch `ping_visual_final`. 4 ảnh đại diện chép sang `docs/screens/`                                                                                                                                                                 |
| Lint / prettier / typecheck / docs:check / build              | lint **0 error / 14 warning cũ**; prettier sạch; `typecheck` sạch (`next typegen` + `tsc --noEmit`); `docs:check` không có link tương đối gãy; `pnpm build` xanh                                                                                                                                                                                                                                                          |

## Lỗi thật bắt được và cách sửa

- **Link auth dưới AA ở theme tối (4,01:1).** antd không dùng thẳng `colorLink` mà sinh dải màu từ
  seed, nên `<a>` ra `#4483cd` trong khi `--link` là `#4d96ee`. axe bắt ở login/register (dark).
  Sửa: đặt `text-link` trên `<span>` con cho 9 link auth (login, register, quên/đặt lại mật khẩu,
  xác minh email) — cùng mẫu đã dùng cho tên kênh/DM/settings.
- **Nhãn nhóm quick switcher 4,20:1 (nền sáng).** Chữ `muted` trên dòng đang chọn nền `accent`
  (`#e7e8eb`) dưới ngưỡng. Sửa: dòng đang chọn dùng `accent-foreground`.
- **Gợi ý emoji trong composer cùng lỗi.** Mã `:shortcode:` và từ khoá dùng `muted` trên nền
  `accent`. Sửa: đổi sang `accent-foreground` khi dòng đang chọn.
- **Tương phản avatar 2,29:1.** antd `Avatar` mặc định chữ trắng trên nền 25% (axe bắt ở icon
  server đang chọn). Sửa: ghim `Avatar.colorTextPlaceholder = muted`,
  `colorTextLightSolid = foreground` trong `buildAntdTheme` (16,53:1 sáng, 12,14:1 tối).
- **Tooltip chặn click.** `PingTooltip` đè danh sách kênh và nuốt cú bấm. Sửa:
  `styles.root.pointerEvents = 'none'` — tooltip chỉ để đọc.
- **Header sidebar cắt chữ.** `h-12` + nút antd `controlHeight 36` ép tên server còn 11 px. Sửa:
  tên server `text-sm`, `PingIconButton size="small"` (24 px).
- **axe "đỏ" lúc có lúc không ở màn Tài khoản.** axe đọc màu ngay giữa transition màu (đo được
  `#625d60` trên `#2a2a2e` ≈ 2,2:1) sau khi đổi nền; màu cuối vẫn đạt (6,38:1 sáng, 7,2:1 tối).
  Sửa trong test: chờ `<html data-theme>` (bỏ khung SSR sáng), chờ animation hữu hạn xong, tạm tắt
  transition đúng lúc quét rồi gỡ ngay (để nguyên sẽ chặn animation vào của menu mở sau đó). App
  không đổi.
- **Nút "Sao chép mã mời" không còn ở header sidebar.** PR1 đưa hành động vào menu server (bám
  Discord); cập nhật `e2e/auth-and-shell.spec.ts` và `scripts/capture-states.mjs` theo menu mới.
- **`settings.spec.ts` bỏ chặn "treo" trên DB dev chung.** Test không gửi được DELETE nào: hàng chục
  server trong DB dev khiến polling `/unread` bão hoà 6 kết nối HTTP/1.1 của Chrome và ăn 429
  (rate limit 100 request/phút/IP). Chạy lại trên DB sạch vừa `migrate deploy` + `db seed` thì
  xanh — không phải lỗi app; e2e phải chạy trên DB sạch.

## Lưu ý / quyết định

- **CSS antd unlayered, và link còn bị antd sinh màu:** đặt `bg-*`/`text-*` lên chính phần tử antd
  không có tác dụng; muốn đổi thì sửa token component, truyền `style`, hoặc đặt màu ở `<span>` con
  (đã ghi ở ui-system §4).
- **Cài đặt 232/740** lấy theo khung `visual-refresh` của Discord (modal thật trong phiên đo không
  tải xong), nên ghi là tham chiếu bố cục, không phải số đo trực tiếp. Các số còn lại đo trực tiếp.
- **Ảnh baseline sinh ở bước chốt** (2026-11-02): đủ 72 ảnh `win32` (36 mặc định + 36 Pixel),
  xác nhận lại bằng lượt chạy không update; đã chép 4 ảnh đại diện vào `docs/screens/`.
- **Vận hành e2e**: lượt full rất chậm trên máy dev (đo được 21,9 phút trên DB sạch; máy đang
  chạy nhiều thứ khác có thể 26–30 phút); không build/commit trong lúc chạy. Log đặt ngoài
  `test-results/` vì Playwright xoá thư mục này lúc khởi động. Phải trỏ `DATABASE_URL` vào DB
  sạch vừa migrate + seed, không dùng DB dev chung (xem lỗi 429 ở trên).
- **Hai commit** khi chốt: (a) code/token/test/docs của PR1+PR2, (b) ảnh baseline `win32` 72 ảnh +
  ảnh evidence/screens chụp lại; bộ `linux` cũ đã xoá để CI bootstrap lại theo ADR-0074. OWNER
  duyệt chốt 2026-11-02 — merge `--no-ff` vào `main` và push cùng lượt.

## Việc chưa làm / bước tiếp theo

- ~~Baseline `linux/` cho CI~~ — đã xong 2026-11-14: run bootstrap `43574872728` sinh 36 ảnh,
  commit `3eda1a2`; lần so sánh thật chờ run CI kế tiếp. Bộ `win32` đã sinh và xác nhận từ trước.
- PR2 (skin "Pixel", [ADR-0076](../../../adr/0076-skin-pixel-truc-hinh-thuc-thiet-bi.md)) cùng nhánh
  nhưng **commit riêng** sau PR1 — xem [UI-skins](../UI-skins/README.md).

# Evidence T6.8 — Responsive 375 / 768 / 1280

- Ngày: 2026-11-01 (Asia/Saigon); nhánh `feat/batch2-t67-t610`; base `5819507`.
- ADR: [0073-responsive-shell-375-768-1280.md](../../../adr/0073-responsive-shell-375-768-1280.md)
  (accepted) — thay cách hiểu ADR-0023 cho v0.2.0: dưới `md` (768) rail + sidebar gộp vào **một
  drawer chung** thay vì hai cột hẹp.

## Đã giao

- `features/shell/components/app-shell.tsx` (mới): thanh trên 48px dưới `md` với nút
  `mobile-nav-toggle` (`aria-expanded` + `aria-label` đổi theo trạng thái); rail + sidebar nằm
  trong drawer `id="mobile-nav"`, khoá focus trong panel, Tab/Shift+Tab quay vòng qua cả hai
  nhánh DOM.
  Đóng bằng Esc (trả focus về nút), backdrop, đổi route, hoặc khi cửa sổ rộng qua `md`
  (`matchMedia`).
- `(app)/layout.tsx`, `settings/layout.tsx`, `settings-nav`, `server-rail`, `channel-sidebar`,
  `channel-navigation`, `channel-view`, `dm-sidebar`, `dm-view`, `member-panel`, `message-pane`,
  `ping-table`, `admin-surface`: bỏ bề ngang cố định, dùng `md:`/`max-md:`; bảng có `overflow`
  ngang trong khung; rail giữ 48px; composer dính đáy khung chat; panel thành viên ẩn dưới `md`
  (thay bằng nút mở trong header) để nội dung không bị bóp.
- `globals.css`: biến chiều cao thanh trên/drawer + `dvh` cho composer (bàn phím di động), không
  tràn ngang ở cả ba mốc.
- `e2e/responsive.spec.ts` (mới): giữ 1 lần đăng nhập, đổi viewport trên cùng trang.

## Kiểm chứng

| Hạng mục       | Kết quả                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 1280           | rail + sidebar cạnh nhau, không tràn ngang, gửi tin được — **pass**                                       |
| 768 (`md`)     | vẫn rail + sidebar tĩnh, chưa có thanh trên, không tràn ngang — **pass**                                  |
| 375            | thanh trên + drawer chung; Esc đóng, trả focus về `mobile-nav-toggle`; không tràn ngang — **pass**        |
| 375 chọn kênh  | drawer tự đóng, danh sách ảo 300 tin vẫn cuộn được — **pass**                                             |
| a11y ở 375/768 | drawer và shell 768 được quét axe (T6.9) — 0 vi phạm                                                      |
| Ảnh            | `screens/`: `375-channel`, `375-drawer`, `768-channel`, `1280-channel` (script `capture-polish.mjs`)      |
| Lần chạy       | `E2E_PRODUCTION=1 npx playwright test e2e/responsive.spec.ts` → **4/4 pass (33,1 s)** cùng quick-switcher |

## Giới hạn

- Chưa đo trên thiết bị thật (chỉ Chromium/Playwright); `dvh` và bàn phím di động cần pilot T7.
- Không có breakpoint 1024 riêng: 768–1023 dùng bố cục desktop hẹp, đúng phạm vi ADR-0073.

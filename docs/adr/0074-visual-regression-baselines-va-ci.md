# ADR-0074: Visual regression bằng Playwright, baseline tách theo hệ điều hành, job CI `visual`

Status: accepted — trong phạm vi TF.13 (kế hoạch v0.2.0 đã được OWNER duyệt) thi công trong lô
gộp 3, phiên 2026-11-01 (ủy quyền "gom hết việc không cần tới chi phí vào 1 lô làm luôn 1 lần").
Date: 2026-11-01

## Context

TF.13 (docs/ping-v0.2.0-plan.md:448) yêu cầu Playwright chụp các màn chính (đăng nhập, chat,
quản trị, search, AI) × sáng/tối × 375/768/1280, che vùng động, baseline nằm trong repo, CI có
job visual và diff vượt ngưỡng chặn PR đến khi duyệt. Các ràng buộc thực tế đã gặp:

- Ảnh pixel phụ thuộc nền tảng: DirectWrite (Windows) và FreeType (Linux) khử răng cưa khác
  nhau, dù cùng dùng font Geist tự host; một bộ baseline dùng chung vượt ngưỡng ở vài màn.
- Vùng động trong app: giờ tương đối trong `<time>`, thanh cuộn Chromium, banner "Đang kết nối…"
  sau handshake socket, câu trả lời AI do model sinh.
- Refresh token xoay vòng sau mỗi lần dùng; dùng lại cookie của lần refresh trước bị coi là đánh
  cắp và API thu hồi mọi phiên của user — không thể chia sẻ `storageState` giữa các test.
- Playwright `mask` tô hộp màu tím `#FF00FF`, che cả nội dung xung quanh; `--update-snapshots` có
  thể không ghi lại baseline cũ khi khác biệt nằm trong `maxDiffPixelRatio`, khiến ảnh "cũ nhưng
  vẫn đạt" và hộp mask tím nằm lại trong repo.
- Tiếng Việt cần subset `vietnamese` của font, nếu không dấu bị fallback sang font hệ thống và
  mỗi hệ điều hành render một kiểu.

## Decision

1. **Config riêng, luôn chạy bản production.** `apps/web/playwright.visual.config.ts` +
   `apps/web/visual/` tách khỏi `pnpm test:e2e`. Config luôn dùng `next start` + API `start:prod`
   để ảnh không lẫn khác biệt dev/prod; script `test:visual` / `test:visual:update` có
   `pretest:*` build API + web trước, tránh so với bản build cũ. CI gọi thẳng
   `playwright test --config …` sau khi đã build.
2. **Baseline tách theo hệ điều hành**: `snapshotPathTemplate` =
   `{testDir}/__screenshots__/{platform}/{arg}{ext}`. Bộ `win32/` (máy dev) được commit; bộ
   `linux/` do job CI sinh ở lần chạy đầu rồi upload artifact để commit. Chưa hỗ trợ macOS.
3. **36 ảnh**: 6 màn (login, chat, search, settings người dùng, quản trị server, ngăn kéo AI) ×
   sáng/tối × 375×812 / 768×1024 / 1280×800, mỗi ảnh chụp viewport (không full-page).
4. **Tái lập dữ liệu và phiên**: global setup đăng nhập alice trên DB seed sạch, đặt lại
   settings giao diện, đánh dấu đã đọc mọi kênh; mỗi test đăng nhập API phiên mới (paced ≤ 6
   lượt/phút) thay vì chia sẻ cookie; AI được mock SSE ngay trong test (nội dung, trích dẫn do
   test quyết định, phần còn lại vẫn chạy API thật).
5. **Ổn định ảnh bằng CSS thay vì mask**: ẩn thanh cuộn và ẩn `<time>` bằng
   `visibility: hidden` (giữ chỗ, không đổi layout); chờ font `document.fonts.ready` và chờ
   banner kết nối biến mất; `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`,
   `deviceScaleFactor: 1`, locale `vi-VN`, múi giờ `Asia/Ho_Chi_Minh`, `reducedMotion`.
6. **Dung sai**: `threshold: 0.3`, `maxDiffPixelRatio: 0.015`. Không dùng `mask`.
7. **Quy trình cập nhật baseline**: khi thay đổi UI có chủ đích, xoá thư mục baseline của nền
   tảng đang dùng rồi chạy lại với `--update-snapshots`, mở ảnh mới và ảnh diff để duyệt trước
   khi commit. Không cập nhật chỉ vì test đỏ.
8. **Job CI `visual`** (tên check `visual`, chạy khi vùng web đổi): Postgres 17 + Redis 7, migrate
   - seed, build API/web, chạy bộ visual. Nếu chưa có `__screenshots__/linux`, job sinh baseline
     Linux, đạt kèm cảnh báo (bootstrap, **chưa gác hồi quy**) và upload artifact
     `visual-baselines-linux` để commit; các lần sau mới so sánh thật. Job là required check cùng
     `verify`, `api-e2e`, `web-e2e-gate`, `migrations`, `security`.

## Consequences

- Mỗi lần vùng web đổi, CI thêm ~2–4 phút runner (một worker, tuần tự) và một job nữa trong
  danh sách required check.
- Lần chạy CI Linux đầu tiên **không** chặn hồi quy; phải commit bộ `linux/` từ artifact thì cổng
  mới có hiệu lực. Đây là đánh đổi có chủ đích thay vì so ảnh Windows trên Linux (sẽ đỏ giả).
- Ảnh chỉ phủ viewport đầu của mỗi màn; phần dưới màn hình (bảng audit, thành viên) không được
  gác. Muốn phủ thêm thì thêm ảnh cuộn có chủ đích, không đổi sang full-page (chiều cao phụ thuộc
  dữ liệu).
- Baseline là ảnh nhị phân trong repo: PR đổi giao diện sẽ kèm ảnh; review phải xem ảnh, không
  chỉ đọc diff code.
- **Cập nhật 2026-11-01:** 36 ảnh `linux/` đã được commit (`13ea987`); run 41294800751 job `visual`
  so sánh thật, xanh 4 phút và không upload artifact. Cổng nay có hiệu lực trên Linux — run nào
  còn artifact `visual-baselines-linux` là lượt đó lại bootstrap (thiếu ảnh), không gác.
- **Cập nhật 2026-11-02:** skin Pixel ([ADR-0076](0076-skin-pixel-truc-hinh-thuc-thiet-bi.md)) nhân
  đôi số ảnh thành **72/nền tảng** (ảnh mặc định giữ tên cũ, ảnh Pixel thêm `-pixel`). Bộ baseline
  đang được sinh lại một lượt cùng PR1+PR2 tại bước chốt; baseline cũ 36 ảnh hết hiệu lực.
- Không thay thế e2e hành vi (axe, luồng chức năng) — chỉ gác hồi quy thị giác.

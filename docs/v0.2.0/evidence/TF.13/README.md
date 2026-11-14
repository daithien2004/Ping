# Evidence TF.13 — Visual regression: 36 baseline, job CI `visual`

- Ngày/múi giờ: 2026-11-01 (Asia/Saigon), chạy lúc 12:50–13:00.
- Người thực hiện/review: agent thi công; OWNER duyệt phạm vi lô gộp 3.
- Task, nhánh và PR: TF.13, nhánh `feat/batch2-t67-t610` (lô gộp 3), PR nháp local.
- Commit nguồn/code được kiểm: bản làm việc trên `5819507` (code visual chưa commit khi chạy).
- Môi trường: Windows 11, Node 24.18.0, pnpm 10.26, Chromium do Playwright 1.63 quản lý;
  API + web chạy **bản production** (`start:prod` / `next start`), Postgres 17 + Redis 7 local
  trên DB `ping_visual` (migrate + seed sạch), web cổng 3000, API cổng 4000.
- Phụ thuộc, phạm vi và ADR: [ADR-0074](../../../adr/0074-visual-regression-baselines-va-ci.md)
  (baseline tách theo hệ điều hành, job `visual` là required check, quy trình cập nhật ảnh).

## Đã giao

- `apps/web/playwright.visual.config.ts`: config riêng, luôn chạy bản production; baseline
  `snapshotPathTemplate = {testDir}/__screenshots__/{platform}/{arg}{ext}`; `workers: 1`;
  `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`, `threshold: 0.3`,
  `maxDiffPixelRatio: 0.015`; locale `vi-VN`, `Asia/Ho_Chi_Minh`, `reducedMotion`, scale 1.
- `apps/web/visual/global-setup.ts`: chờ API, đăng nhập alice, reset settings giao diện, đánh
  dấu đã đọc mọi kênh; **không** dùng storageState.
- `apps/web/visual/visual.spec.ts`: 6 test (3 viewport × sáng/tối), mỗi test một phiên đăng nhập
  API riêng rồi chụp 5 màn: chat → search → settings/appearance → `/servers/:id/settings`
  (quản trị) → ngăn kéo hỏi AI (mock SSE).
- `apps/web/visual/auth.spec.ts`: 6 test chụp màn `/login` không có phiên.
- `apps/web/src/app/layout.tsx`: Geist thêm subset `vietnamese` để dấu tiếng Việt không fallback
  sang font hệ thống (nguyên nhân lệch ảnh giữa Windows/Linux).
- `apps/web/src/features/search/components/search-modal.tsx`: ngày kết quả bọc `<time
dateTime=…>` — vừa đúng ngữ nghĩa, vừa ẩn được bằng CSS thay vì mask.
- `apps/web/package.json`: `build:visual` + `pretest:visual` / `pretest:visual:update` (build API
  và web trước khi so/chụp), `test:visual`, `test:visual:update`.
- `.github/workflows/ci.yml`: job `visual` (Postgres 17 + Redis 7, migrate + seed, build, chạy
  bộ visual, bootstrap `linux/` kèm artifact); thêm `visual` vào danh sách required check.
- Baseline: `apps/web/visual/__screenshots__/win32/` — **36 ảnh** (6 màn × 2 sáng/tối × 3
  viewport). Ảnh mẫu: [screens/](screens/).

## Thay đổi và kiểm chứng

| Tiêu chí đạt                                                        | Lệnh/cách thử                                                                                    | Kết quả | File log/ảnh/số đo                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| Đủ 6 màn × sáng/tối × 375/768/1280, baseline trong repo             | `ls apps/web/visual/__screenshots__/win32 \| wc -l`                                              | pass    | 36 PNG (`login`, `chat`, `search`, `settings`, `admin`, `ask`)                               |
| So ảnh lần đầu sau khi sinh baseline (cùng máy)                     | `pnpm --filter web exec playwright test --config playwright.visual.config.ts`                    | pass    | **12/12 test, 2,1 phút**; không diff                                                         |
| Sinh/ cập nhật baseline                                             | `pnpm --filter web exec playwright test --config playwright.visual.config.ts --update-snapshots` | pass    | 12/12, 2,2 phút; chỉ 6 ảnh `admin-*` được ghi mới, 30 ảnh cũ khớp                            |
| Màn quản trị server hiện đúng nội dung (không rỗng/không lỗi quyền) | xem `admin-light-1280x800.png`, `admin-dark-375x812.png`                                         | pass    | [admin-dark-1280](screens/admin-dark-1280x800.png) và ảnh 375 trong bộ baseline              |
| Vùng động không làm đỏ giả: giờ, thanh cuộn, banner kết nối, AI     | hai lượt chạy liên tiếp không `--update-snapshots`                                               | pass    | 2 lượt 12/12; `<time>` ẩn bằng `visibility`, AI mock SSE                                     |
| Không còn hộp mask màu tím trong baseline                           | quét ảnh + xem trực tiếp 6 ảnh mẫu                                                               | pass    | không có pixel `#FF00FF`; ảnh mẫu ở `screens/`                                               |
| CI có job visual, chặn khi vượt ngưỡng, bootstrap Linux lần đầu     | đọc `.github/workflows/ci.yml` mục `visual`                                                      | pass    | job `visual` + artifact `visual-baselines-linux`; lần chạy CI thật ghi ở status sau khi push |
| Typecheck / lint web sau thay đổi                                   | `pnpm --filter web typecheck`; `pnpm --filter web lint`                                          | pass    | typecheck sạch; lint 0 error (14 warning có sẵn từ trước, không thuộc TF.13)                 |

## Logic/lỗi và bài học

1. **Refresh token xoay vòng**: chia sẻ `storageState` giữa 6 test làm 23/24 ảnh chụp vào màn
   đăng nhập (cookie bị thu hồi sau lần refresh đầu). Sửa: mỗi test đăng nhập API phiên mới,
   `pacedLogin` giữ ≤ 6 lượt/phút dưới rate limit 10/phút/IP.
2. **`baseURL` nuốt `/api/v1`**: request context có `baseURL` + path `/users/me/settings` thành
   `http://localhost:4000/users/me/settings` (404). Sửa: dùng URL tuyệt đối tới `/api/v1/...`.
3. **Mask tím + baseline cũ**: `--update-snapshots` không ghi lại ảnh cũ vì khác biệt nằm trong
   `maxDiffPixelRatio`, nên hộp mask tím tồn tại qua nhiều lần "cập nhật". Sửa: bỏ mask, ẩn vùng
   động bằng CSS, xoá cả thư mục baseline và sinh lại từ đầu rồi xem ảnh bằng mắt.
4. **Ngày trong kết quả search**: `toLocaleString` đổi theo ngày chạy. Sửa: bọc `<time>` và ẩn
   bằng `visibility` — layout không đổi, ảnh không phụ thuộc ngày.
5. **Font tiếng Việt**: thiếu subset `vietnamese` làm dấu bị fallback, khác giữa Windows/Linux.
   Đã thêm subset; ảnh baseline ổn định qua hai lượt chạy liên tiếp.
6. **DB dev chung làm đỏ oan (gặp ở full gate)**: chạy trên `ping` — DB tích thêm tin chat
   tay/test — thì tin seed trôi khỏi trang đầu (setup báo "thiếu tin seed") và ảnh chat lệch
   baseline dù giao diện không đổi. Visual chỉ có nghĩa trên DB sạch vừa migrate + seed; thông
   báo lỗi của `visual/global-setup.ts` nay chỉ thẳng cách chạy đúng, và lệnh đầy đủ nằm ở mục
   "Chạy lại" bên dưới. Lần chạy lại trên `ping_visual`: **12/12, 2,3 phút**.

## CI lần đầu trên Linux (2026-11-01)

- Run [41288747574](https://github.com/daithien2004/Ping/actions/runs/41288747574) trên `main`
  `fd4e05f`: job `visual` **xanh ở chế độ bootstrap** (repo chưa có `__screenshots__/linux`), sinh
  36 ảnh Linux và upload artifact `visual-baselines-linux` (id 13075953360, 1.585.158 byte).
- Lượt đó **chưa gác hồi quy trên Linux** vì artifact chưa được commit (máy dev không có `gh`;
  endpoint artifact của GitHub API trả 401 khi không đăng nhập, URL UI trả 404). Đã xử lý trong
  mục kế tiếp.

## Baseline Linux đã commit (2026-11-01)

- Tải artifact `visual-baselines-linux` (id 13075953360, 1.585.158 byte) từ run 41288747574 bằng
  tài khoản OWNER, giải nén 36 ảnh vào `apps/web/visual/__screenshots__/linux/`; danh sách tên
  khớp đúng `win32/` (36 tệp), đã mở một ảnh xác nhận đúng màn chat, dữ liệu seed sạch.
- Commit `13ea987` (chỉ thêm ảnh nhị phân, không đổi mã web).
- Run [41294800751](https://github.com/daithien2004/Ping/actions/runs/41294800751) trên `13ea987`:
  job `visual` **xanh 4 phút và không upload artifact** → đã đi nhánh so sánh, không bootstrap.
  `web-e2e` 3 shard, `verify`, `security`, `docker`, `lighthouse` cũng xanh; `api-e2e`/`migrations`/
  `drills` skip theo bộ lọc.
- Hệ quả: từ nay mọi run CI có vùng web đều **gác hồi quy giao diện** trên Linux.

## Bootstrap lại sau khi bỏ skin (2026-11-14)

- Bộ `linux/` bị xoá ở `97a4edf` khi sinh lại baseline `win32`; run
  [43574872728](https://github.com/daithien2004/Ping/actions/runs/43574872728) (workflow_dispatch,
  commit `3435a8b`) xanh ở chế độ bootstrap, sinh 36 ảnh và upload artifact
  `visual-baselines-linux` (id 14106296322, 1.552.433 byte).
- Artifact tải qua credential git sẵn có trên máy OWNER (endpoint vẫn trả 401 khi không đăng
  nhập). Danh sách 36 tên khớp đúng `win32/`; kích thước ảnh đúng 375×812, 768×1024, 1280×800.
- Commit `3eda1a2` chỉ thêm ảnh nhị phân. **Chưa có bằng chứng so sánh** cho tới run CI kế tiếp
  sau khi push: lúc đó job `visual` phải xanh, không upload artifact, mới tính là gác hồi quy trên
  Linux.

## Review, giới hạn và tiếp tục

- **Bootstrap Linux là lỗ hổng tiềm ẩn**: nếu ai đó xoá hoặc thêm test mới mà thiếu
  `__screenshots__/linux`, job tự sinh ảnh, đạt kèm cảnh báo và không so sánh gì (đã commit bộ
  36 ảnh ngày 2026-11-01 nên hiện tượng này không còn xảy ra). Cách phát hiện: run có artifact
  `visual-baselines-linux` nghĩa là lượt đó không gác.
- **Phạm vi ảnh**: chỉ chụp viewport đầu của mỗi màn; phần dưới (bảng audit, danh sách thành
  viên) không được gác. Không dùng full-page vì chiều cao phụ thuộc dữ liệu.
- **Nền tảng**: chưa có baseline macOS; chỉ Chromium (không Firefox/WebKit).
- **Không thay e2e hành vi**: luồng chức năng, a11y và axe vẫn do `pnpm test:e2e` phủ.
- **Chạy lại**: phải trỏ vào DB sạch vừa migrate + seed, **không** dùng DB dev chung `ping`
  (tin chat tay/test làm ảnh lệch baseline và tin seed trôi khỏi trang đầu):

  ```bash
  docker exec ping-postgres-1 createdb -U ping ping_visual   # chỉ lần đầu
  export DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_visual"
  pnpm --filter api exec prisma migrate deploy
  pnpm --filter api exec prisma db seed
  pnpm --filter web test:visual                              # tự build API + web rồi so
  ```

  Cập nhật baseline có chủ đích: `pnpm --filter web test:visual:update` sau khi xoá thư mục
  baseline của nền tảng đang dùng. API/web đang chạy sẽ được tái sử dụng nếu cùng cổng
  3000/4000 **và cùng `DATABASE_URL`** — tắt process cũ trước khi đổi DB, nếu không chúng phục
  vụ DB khác với `DATABASE_URL` của lần chạy.

- Rollback: xoá job `visual` khỏi CI và thư mục `visual/` nếu chi phí > giá trị; không ảnh hưởng
  code sản phẩm.

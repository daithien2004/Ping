# TF.9 — Trạng thái và vi tương tác

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/tf.9-states-motion`, base commit `f105e8f`.
- Task: TF.9 (Pha 3/4).
- Commit: `72bb7d1` (triển khai), `3e45f25` (fix retry GET), `a299ac7` (e2e), `c1c4b73` (fix a11y
  onboarding), `7e58cd7` + `3d23862` (tài liệu + ảnh trạng thái), `2977fe3` (bằng chứng + status),
  `9aafd7f` (dọn script chụp ảnh), `2c99e10` + `962800e` (chờ API sau seed + ghi chú flake).

## Thay đổi

### Quy ước trạng thái (tài liệu)

- `docs/design/states.md`: quy ước chung cho 5 nhóm trạng thái — loading (skeleton thay spinner),
  empty (luôn có hành động), error (luôn có mã lỗi để tra cứu), toast (một quy ước duy nhất) và
  motion (≤ 200 ms, tôn trọng `prefers-reduced-motion`); kèm bảng trạng thái từng màn và checklist
  review.

### Loading — skeleton thay spinner

- `apps/web/src/features/members/components/member-panel.tsx`: khung thành viên dùng `Skeleton`
  (`data-slot="skeleton"`) + `role="status"` với `aria-label` ("Đang tải thành viên…") thay cho vòng
  quay; giữ nguyên kích thước để không nhảy layout.
- `apps/web/src/features/messages/components/message-pane.tsx`: danh sách tin nhắn dùng khung
  skeleton, có nhãn "Đang tải tin nhắn…".
- `apps/web/src/components/ui/skeleton.tsx`: có sẵn từ trước; thêm `role`/`aria-label` qua props.

### Empty — luôn có hành động

- `apps/web/src/features/messages/components/message-pane.tsx`: kênh chưa có tin có nút "Gửi tin
  đầu tiên" điều hướng vào composer.
- `apps/web/src/features/messages/components/message-composer.tsx`: expose hàm focus để nút empty
  state đưa con trỏ vào ô nhập.
- `apps/web/src/features/channels/components/channel-navigation.tsx` + `channel-sidebar.tsx`: danh sách
  channel rỗng có nút "Tạo channel"; khi user không có quyền tạo thì chỉ hiện lời nhắc, không hiện
  nút không dùng được.
- `apps/web/src/components/quick-switcher.tsx`: kết quả tìm kiếm rỗng dùng `PingEmpty` + khoá i18n
  `common.noResults` (thay câu hard-code "Không tìm thấy").
- `apps/web/src/components/ui/ping-empty.tsx`: thêm ảnh minh hoạ `PING_EMPTY_IMAGE_SIMPLE`.

### Error — có mã lỗi để tra cứu

- `apps/web/src/features/members/components/member-panel.tsx`: lỗi tải danh sách thành viên hiện
  `role="alert"` kèm "Mã lỗi: `<requestId>`" và nút "Thử lại" (không mất trạng thái app).
- `apps/web/src/app/(auth)/error.tsx` (mới): ranh giới lỗi cho nhóm `(auth)` — trước đó lỗi ở đây rơi
  thẳng xuống `global-error` (mất trọn khung đăng nhập); giờ hiện thông báo + mã lỗi + nút thử lại.
- `apps/web/src/app/(app)/error.tsx`, `app/not-found.tsx`: link "về trang chủ" trỏ `/servers` (trước
  `router.replace('/')` chạy về landing ngoài app shell).

### Toast — một quy ước duy nhất

- `apps/web/src/components/ui/ping-toast.tsx`: viết lại theo `App.useApp()` của antd (message),
  giữ đúng API `pingToast.success(...)` cho toàn app.
- `apps/web/src/providers/theme-provider.tsx`: thêm `PingToastHost` để `App` của antd có context
  (dùng `App.useApp()` ngoài provider sẽ ném lỗi).
- `apps/web/src/features/channels/components/channel-sidebar.tsx`: nút "Sao chép mã mời" báo toast
  "Đã sao chép mã mời." / "Không sao chép được mã mời." (khoá i18n `servers.copyInvite`,
  `servers.inviteCopied`, `servers.copyFailed`).

### Motion ≤ 200 ms

- `apps/web/src/lib/theme/tokens.ts`: token `motion.slow` 320 ms → 200 ms.
- `apps/web/src/app/globals.css`: khối `prefers-reduced-motion: reduce` tắt animation/transition toàn
  trang.

### Sửa lỗi phát hiện khi kiểm chứng

- `apps/web/src/lib/api-client.ts`: GET idempotent thử lại **một lần** sau 300 ms khi lỗi mạng
  (`fetch` reject / lỗi 0) — bù cho việc API restart giữa chừng làm socket keep-alive cũ chết.
  POST/PATCH/DELETE không thử lại (tránh ghi trùng). Thêm 3 test ở `api-client.test.ts`.
- `apps/web/src/features/servers/components/onboarding-wizard.tsx`: bỏ `autoFocus` (vi phạm
  `jsx-a11y/no-autofocus`) và thay bằng `ref` + `useEffect` focus khi bước chi tiết hiện ra — giữ
  nguyên trải nghiệm, không nới luật a11y.
- `apps/web/e2e/global-setup.ts`: chờ `/api/v1/health` sẵn sàng trước khi chạy test.
- `apps/web/e2e/loading-and-empty.spec.ts`, `auth-and-shell.spec.ts`: thêm coverage cho skeleton thành
  viên, empty state có hành động và toast sao chép mã mời.

## Kiểm chứng

| Tiêu chí       | Lệnh                                       | Kết quả                                               |
| -------------- | ------------------------------------------ | ----------------------------------------------------- |
| Typecheck web  | `pnpm --filter web typecheck`              | pass                                                  |
| Lint web       | `pnpm --filter web lint`                   | pass (0 lỗi, 0 cảnh báo)                              |
| Unit tests web | `pnpm --filter web test`                   | pass (19 file, 107 test)                              |
| Build web      | `pnpm --filter web build`                  | pass                                                  |
| Format         | `pnpm format:check`                        | pass                                                  |
| e2e toàn bộ    | `WEB_PORT=3101 pnpm exec playwright test`  | 23 pass, 1 skip (`local-deployment`, cần HTTPS local) |
| Ảnh trạng thái | `node apps/web/scripts/capture-states.mjs` | 12 ảnh, 12/12 trạng thái đúng, 12 hash khác nhau      |

Ảnh trạng thái: [`screens/`](screens/) — 12 ảnh (đăng nhập, lỗi phiên, khung chat rỗng, skeleton
tin nhắn, skeleton thành viên, lỗi thành viên, lỗi vùng nội dung, channel rỗng, toast sao chép mã
mời, tìm nhanh không kết quả, 404, bản sáng).

## Ghi chú / điều đã học

- **Lỗi e2e "Không kết nối được máy chủ."**: nguyên nhân không phải hướng dẫn sửa của UI mà là
  `nest start --watch` **restart API** khi `packages/shared/dist` đổi (turbo typecheck/build), nên
  trình duyệt dùng lại socket keep-alive đã chết → `fetch` reject → `ApiError(0, SERVICE_UNAVAILABLE)`
  ném ra khỏi `useMe()` (suspense query) → rơi vào màn `global-error`. Đã sửa theo ba lớp: retry GET
  một lần, thêm ranh giới lỗi `(auth)`, và e2e chờ health endpoint trước khi chạy.
- **API restart giữa lúc chạy e2e** (`ECONNREFUSED ::1:4000` ở test gọi API trực tiếp): script seed
  của `global-setup` có thể chạm file mà API đang watch → API restart → test gặp connection refused.
  Đã thêm lần chờ health **sau khi seed** trong `global-setup.ts`. Ngoài ra nên bật API xong chờ
  ≥ 60–75 giây rồi mới chạy e2e, và không chạy `turbo typecheck/build` giữa lúc bật API và lúc
  chạy test (build lại `packages/shared/dist` cũng làm API restart).
- **Hook pre-commit lint yếu hơn `pnpm --filter web lint`**: lint-staged chạy
  `eslint --config apps/web/eslint.config.mjs --fix` **từ thư mục gốc**, nên các khối rule giới hạn
  theo `files: ['src/**/*.tsx']` không khớp (basePath lệch) → `jsx-a11y/no-autofocus` không bật, và
  chính ESLint còn tự gỡ dòng `eslint-disable-next-line` thành `{ }`. Hậu quả: một chỗ dùng
  `autoFocus` lọt qua hook và để lại code lỗi. Đã sửa bằng cách **không nới luật** (bỏ `autoFocus`,
  focus bằng `useEffect`); phần hạ tầng lint-staged nên sửa ở task riêng.
- **Ảnh chụp trạng thái bị sai ba lần** và cả ba đều không lộ ra nếu chỉ nhìn "script chạy xong":
  1. trình duyệt trả danh sách thành viên từ HTTP cache nên trạng thái "đang tải" không xuất hiện →
     ảnh skeleton **trùng byte-for-byte** với ảnh đã tải (đã tắt cache bằng CDP
     `Network.setCacheDisabled`);
  2. toast của antd trượt xuống từ trên nên chụp lúc animation còn nằm ngoài khung nhìn (y = −28) →
     phải chờ animation lắng xuống và kiểm tra `boundingBox().y >= 0`;
  3. ảnh "channel rỗng" chụp lúc danh sách thành viên còn đang tải → phải chờ **tín hiệu có dữ liệu**
     (tên thành viên hiện ra), không phải chờ element biến mất.
     Script giờ **tự kiểm tra trạng thái ngay trước khi chụp** và báo lỗi thay vì tạo ra ảnh sai; các
     request "đang tải" được **giữ treo** bằng gate thay vì delay cố định nên ảnh không phụ thuộc tốc độ
     mạng.
- **Router cache của Next (`<Activity>`)** giữ trang đã rời trong DOM (ẩn): `getByRole` bỏ qua phần tử
  ẩn còn `getByText().toHaveCount()` thì không — assertion e2e phải `filter({ visible: true })`.

## Giới hạn

- Ảnh chụp từ dev server (`next dev`) với request được giữ/mô phỏng, chưa chụp trên bản build
  production với dữ liệu thật.
- Lighthouse cho landing chưa chạy: chưa có staging/proxy/TLS (đo local không đại diện) — còn nợ từ
  TF.8.
- Ảnh mới chỉ phủ app shell + auth; các màn của TF.10/TF.11 (quản trị, AI) chưa có nên chưa có ảnh
  trạng thái tương ứng.
- Pha 2 (T2.1–T2.11) của kế hoạch vẫn chưa làm (thiếu ngân sách).
- Chưa push lên remote (theo yêu cầu, chỉ merge vào `main` local).

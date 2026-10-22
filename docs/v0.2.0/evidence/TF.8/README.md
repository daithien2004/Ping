# TF.8 — Landing + xác thực + onboarding

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `main` (commit thẳng, xem ghi chú), base commit `b0ed821`.
- Task: TF.8 (Pha 3/4).
- Commit: `fa90c50` (triển khai), `58a0a4f` (fix lỗi e2e/a11y/lint phát hiện khi kiểm chứng).

## Thay đổi

- `apps/web/src/app/(public)/layout.tsx`, `apps/web/src/app/(public)/page.tsx`: landing `/` mới (hero, điểm
  nổi bật, CTA đăng nhập/đăng ký) dùng `Ping*` + token theme; tách khỏi `(app)` để người chưa đăng nhập
  không đi qua app shell.
- `apps/web/src/app/(app)/page.tsx` → xoá; `apps/web/src/app/(app)/servers/page.tsx`: `/servers` render
  `HomeRedirect` (vào server đầu tiên, hoặc mở wizard onboarding khi chưa có server).
- `apps/web/src/features/auth/components/login-form.tsx`, `register-form.tsx`: chuyển sang `PingForm` /
  `PingFormItem` / `PingInput` / `PingPasswordInput`, validate bằng `zodFormRules` (cùng schema
  `packages/shared` với API) nên lỗi định dạng báo ngay, không tốn request.
- `apps/web/src/lib/form-adapter.ts` (+ `form-adapter.test.ts`): adapter zod → `FormRule` của antd (map
  `min`/`max`/`email`/`regex`/message), có unit test.
- `apps/web/src/features/servers/components/onboarding-wizard.tsx`: wizard 2 bước (chọn tạo/tham gia →
  điền chi tiết) thay cho hai dialog rời; mở với `initialMode` thì bỏ qua bước 1; `destroyOnHidden` để
  không giữ dữ liệu giữa các lần mở.
- `apps/web/src/components/ui/ping-steps.tsx`: `PingSteps` (bọc antd `Steps`) cho wizard.
- `apps/web/src/features/servers/components/server-rail.tsx`: hai nút "Tạo server"/"Tham gia server"
  cùng mở wizard với `initialMode` tương ứng.
- `apps/web/src/features/auth/session.ts`: `safeRedirectPath` trả `/servers` khi thiếu `next` hoặc
  `next` không hợp lệ (không còn trang `/` trong app shell).
- `apps/web/src/features/servers/hooks.ts`: bị kick thì `router.replace('/servers')` (route trong app).
- `apps/web/src/lib/env.ts`: thêm `isProduction` (giữ `process.env` chỉ ở `lib/env.ts`).
- i18n `landing.*` và `servers.wizard.*` (vi/en).

### Sửa lỗi phát hiện khi kiểm chứng (`58a0a4f`)

- `apps/web/src/components/ui/ping-form.tsx`: `useResetOnHide(form, fieldNames)` trả `ref` để bọc form và
  xoá dữ liệu khi `<Activity>` ẩn trang ở **cả hai nơi**: store antd (đặt `''` thay vì `undefined`, vì
  `resetFields()` để lại giá trị nội bộ của Input) và `value` trong DOM (giữ phần tử lúc mount vì `ref`
  có thể đã bị gỡ trước cleanup). Trước đây đăng nhập xong rồi quay lại `/login` (hoặc gõ dở rồi chuyển
  trang) vẫn thấy mật khẩu trong DOM — e2e `auth-and-shell` đếm `input[type=password]` còn giá trị.
- `apps/web/playwright.config.ts`: đọc `WEB_PORT` (mặc định 3000) cho `baseURL`/webServer và truyền
  `PORT` cho `next dev`, để chạy e2e khi cổng 3000 đã bận.
- e2e: `a11y.spec.ts`, `keyboard.spec.ts` bám dialog mới (`Bắt đầu với Ping`); `auth-and-shell.spec.ts`
  bấm nút gửi trong phạm vi dialog (nút mở wizard và nút gửi trùng tên); `realtime.spec.ts` lọc
  `visible` khi đếm tin sau kick vì router cache của Next giữ trang đã rời trong DOM (ẩn) — `getByRole`
  vốn đã bỏ qua DOM ẩn, còn `getByText().toHaveCount()` thì không.
- `onboarding-wizard.tsx`: `autoFocus` vào ô nhập đầu tiên khi mở dialog (WAI-ARIA), kèm disable
  `jsx-a11y/no-autofocus` có lý do; `keyboard.spec` kiểm focus vào textbox khi mở bằng bàn phím.

## Kiểm chứng

| Tiêu chí              | Lệnh                                         | Kết quả                                                         |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| Typecheck web         | `pnpm --filter web typecheck`                | pass                                                            |
| Lint web              | `pnpm --filter web lint`                     | pass (0 lỗi)                                                    |
| Unit tests web        | `pnpm --filter web test`                     | pass (19 file, 104 test)                                        |
| Build web             | `pnpm --filter web build`                    | pass (`/`, `/login`, `/register`, `/servers`, `/dev/ui` tĩnh)   |
| Format                | `pnpm format:check`                          | pass                                                            |
| e2e toàn bộ           | `WEB_PORT=3101 pnpm exec playwright test`    | 22 pass, 1 skip (`local-deployment`, cần HTTPS local)           |
| e2e a11y              | `playwright test e2e/a11y.spec.ts`           | pass — axe sạch ở cả nền sáng/tối, gồm dialog wizard            |
| e2e keyboard/bàn phím | `playwright test e2e/keyboard.spec.ts`       | pass — focus vào textbox khi mở dialog, Esc trả focus về nút mở |
| e2e realtime          | `playwright test e2e/realtime.spec.ts`       | pass — kick, ẩn tin, không rò tin qua DOM ẩn                    |
| e2e auth+shell        | `playwright test e2e/auth-and-shell.spec.ts` | pass — không còn mật khẩu trong DOM sau khi đăng nhập           |

## Ghi chú / điều đã học

- TF.8 được commit thẳng lên `main` (`fa90c50`) thay vì tạo nhánh `chore/tf.8-*` rồi merge `--no-ff`
  như các task trước; bản sửa lỗi `58a0a4f` cũng nằm trên `main`. Đây là chỗ lệch quy trình branch-per-task,
  ghi lại để lần sau giữ đúng.
- Next 16 (Cache Components) dùng `<Activity>` giữ trang đã rời trong DOM: dữ liệu nhạy cảm phải tự xoá
  khi cây bị ẩn, và assertion e2e đếm text trong DOM cần `filter({ visible: true })` trong khi
  `getByRole` đã bỏ qua phần tử ẩn.
- `router.replace('/servers')` giữ app shell (layout dùng lại) thay vì rời sang landing, nhưng trang cũ
  vẫn nằm trong router cache — UI ẩn và API từ chối là điều cần kiểm, không phải "DOM phải rỗng".
- Chạy full e2e ngay sau một lần chạy trước dễ hỏng vì giới hạn tần suất đăng nhập/HTTP: `globalSetup`
  tạo 300 tin nhắn, health check của Playwright bị 429 nên nó bật thêm một API thứ hai và test đầu tiên
  gặp "Network error". Cách chạy ổn định: đợi ≥ 60–75 giây giữa hai lần chạy và kiểm tra chỉ có một
  tiến trình `nest start --watch`.
- Vi phạm `jsx-a11y/no-autofocus` chỉ hợp lý khi focus là chủ ý trong dialog (WAI-ARIA APG), nên tắt
  rule tại chỗ kèm lý do thay vì tắt toàn file.

## Giới hạn

- Lighthouse cho landing chưa chạy: chưa có staging/proxy/TLS (đo local không đại diện).
- Landing chỉ có một trang tĩnh; chưa có trang giá/so sánh/tài liệu — nằm ngoài phạm vi TF.8.
- Chưa kiểm e2e luồng "mở wizard không có server" (trạng thái rỗng) trên bản build production.

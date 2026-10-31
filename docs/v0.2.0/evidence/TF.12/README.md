# Evidence TF.12 — i18n đầy đủ: antd/dayjs, định dạng theo ngôn ngữ, đổi không tải lại

- Ngày: 2026-10-31 (Asia/Saigon); nhánh `feat/batch1-t65-tf11-tf12`; base `132acfb` (main sau TG.10).
- Không cần ADR: hoàn thiện cơ chế i18n đã có (ADR-0022 chọn use-intl + cookie), không đổi kiến
  trúc dữ liệu.

## Đã giao

**Locale của thư viện UI:**

- `apps/web/src/providers/theme-provider.tsx`: `ConfigProvider` nhận `viVN`/`enUS` theo locale hiện
  tại — mọi component antd (Modal/Drawer/Pagination/DatePicker/Empty/Table…) đổi chữ cùng app.
- `apps/web/src/i18n/locale-provider.tsx`: `dayjs.locale(locale)` trong effect mỗi lần đổi (antd
  dùng dayjs cho chọn ngày); `z.config(z.locales.vi()/en())` để **lỗi validate schema** cũng theo
  ngôn ngữ; `document.documentElement.lang` cập nhật.
- Ngày giờ hiển thị theo locale: hồ sơ thành viên dùng `toLocaleDateString(locale)`
  (`member-details-drawer.tsx`), thẻ hồ sơ dùng `Intl.DateTimeFormat(locale, { dateStyle: 'long' })`
  (`profile-popover.tsx`). Số/ngày trong app đã đi qua `Intl`/antd nên không còn định dạng cứng.

**Đổi ngôn ngữ không tải lại:**

- `apps/web/src/i18n/config.ts`: external store (`liveLocale` + `subscribeLocale`) và
  `switchLocale()` chỉ ghi cookie 1 năm, cập nhật store và phát cho subscriber — **không**
  `location.reload()`.
- `LocaleProvider` đọc store qua `useSyncExternalStore` (server snapshot = `vi`), nên
  `IntlProvider`, antd `ConfigProvider`, dayjs và zod đổi tại chỗ trong cùng một render.
- `apps/web/e2e/i18n.spec.ts`: đặt `window.__pingNoReload = true`, đổi vi → en → vi, khẳng định
  marker vẫn còn (biến JS sống qua đổi ngôn ngữ ⇒ không reload), `<html lang>` và nhãn/nút/lỗi
  validate đổi theo.

**Chuỗi:**

- `messages/vi.json` và `messages/en.json` là nguồn duy nhất; unit `messages.test.ts` khẳng định
  hai file **cùng tập key lá**, không giá trị rỗng. Các màn hình chính (auth, shell, chat, quản
  trị, cài đặt) đều đọc `useTranslations`; chuỗi mới của TF.11 (`ask.*`) cũng có đủ vi/en.

## Kiểm chứng

| Hạng mục              | Kết quả                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit              | **271/271** — gồm `messages.test.ts` 4/4 (parity key + không rỗng), `localeFromCookie`                                                                                                                                              |
| Web e2e `i18n`        | **1/1** trong full suite: đổi vi→en→vi, marker không reload còn nguyên, `<html lang>`, nhãn + lỗi zod đổi                                                                                                                           |
| Web e2e toàn bộ       | `E2E_PRODUCTION=1`: **55 pass + 1 skip + 2 fail** — cả hai fail đã xử lý/giải thích ở [TF.11](../TF.11/README.md) (`admin-invite` sửa locator, pass solo; `unread-ui` flake 429 local, pass solo). `i18n` xanh trong cả run đầy đủ. |
| Typecheck/lint/format | typecheck 4/4; lint 0 error; `format:check` sạch                                                                                                                                                                                    |
| Bundle                | **248,2 KB gzip** (≤ 450 KB) — dayjs đã là phụ thuộc bắc cầu của antd, thêm khai báo trực tiếp không tăng bundle đáng kể                                                                                                            |

## Lưu ý

- Locale đọc từ cookie **ở client** (không đọc `cookies()` ở server) để không kéo toàn bộ cây bản
  dịch vào `<Suspense>` dưới `cacheComponents` (ADR-0022). Hệ quả: HTML server render dùng `vi`,
  sau hydrate đổi sang cookie — với app luôn render ở client như hiện tại, người dùng không thấy
  nhấp nháy vì nội dung chính phụ thuộc đăng nhập.
- `switchLocale` chỉ đổi phía client; tải lại trang vẫn giữ lựa chọn nhờ cookie, và SSR khởi tạo
  đúng `vi`/`en` từ cookie ở lần render client đầu tiên.
- Chưa dịch nội dung do người dùng tạo (tên server/kênh, tin nhắn) — đúng phạm vi i18n giao diện.
- Đổi locale antd kéo theo nhãn do antd sinh: nút đóng Modal/Drawer thành «Đóng», bảng rỗng
  «Trống», phân trang «Trang Trước/Kế». `profile.spec.ts` đã cập nhật từ `Close` sang `Đóng`
  (trước đó `locator.click()` chờ vô hạn vì action timeout mặc định bằng 0).

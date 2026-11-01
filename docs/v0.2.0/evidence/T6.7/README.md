# Evidence T6.7 — Polish UI: trạng thái, token, typography

- Ngày: 2026-11-01 (Asia/Saigon); nhánh `feat/batch2-t67-t610`; base `5819507` (main sau lô 1).
- Không cần ADR mới: T6.7 là rà soát/hoàn thiện trên token và quy ước trạng thái đã có
  (ADR-0051 token, `docs/design/states.md`); thay đổi token chỉ nới ngưỡng tương phản.

## Đã giao

**Trạng thái tải lỗi trên các màn mới (loading/empty/error/toast):**

- `settings/appearance`: PATCH lỗi → toast lỗi; tải cài đặt lỗi → `role="alert"` + nút "Thử lại"
  (`refetch`), khoá i18n `settings.appearance.loadFailed`.
- `profile-popover`: lỗi upload avatar hiện `role="alert"` (`avatar-upload-error`); chặn/bỏ chặn
  thành công → toast, lỗi → toast lỗi (khoá `dms.blockedToast`/`dms.unblockedToast`).
- `notification-bell`: tải prefs lỗi → alert + "Thử lại" (`notifications.prefsLoadFailed`); mọi
  mutation đặt/reset mức nhận toast lỗi chung từ `useErrorMessage`.
- `pinned-panel`: bỏ ghim lỗi → toast lỗi (trước đây im lặng).
- `channel-navigation`: lỗi di chuyển/sắp xếp kênh và category (chuột + Alt+Arrow) → toast lỗi;
  danh sách kênh rỗng với người quản lý có lời nhắc (`channels.emptyManage`).
- `sticker-picker` / `emoji-picker`: tải lỗi → `role="alert"` + "Thử lại", giữ tab/server khác
  dùng được (`stickers.loadFailed`, `emoji.serverEmojisLoadFailed`).
- `server-name-form`: lỗi upload icon hiện `role="alert"` (`server-icon-error`).
- `role-editor`: bảng vai trò rỗng dùng `PingEmpty` + khoá `admin.rolesEmpty` (trước là bảng trắng);
  `member-details-drawer`: tải quyền vai trò lỗi → alert + "Thử lại".
- `markdown-text`: khối code và emoji có `aria-label` i18n (`messages.codeBlockLabel`,
  `messages.emojiLabel`) thay vì nhãn tiếng Anh cứng; `e2e/markdown.spec.ts` chuyển từ
  `getByLabel('code')` sang nhãn «Khối mã» theo hợp đồng mới.
- `quick-switcher`: trạng thái rỗng dùng `PingEmpty`, focus vào ô nhập khi mở (xem T6.9).

**Token/tương phản (audit token — phát hiện thật khi quét axe):**

- `lib/theme/tokens.ts`: thêm `palette.ink[550] = #6f6f86`; `lightColors.mutedForeground` đổi từ
  ink-500 (#7a7a92, chỉ **4,18:1** trên trắng và **3,91:1** trên nền ink-50) sang ink-550
  (**4,89:1** trên trắng, **4,57:1** trên ink-50). Đây là màu chữ phụ dùng chung (Tailwind
  `text-muted-foreground` + antd `colorTextSecondary`).
- `lib/theme/antd-theme.ts`: `colorTextDescription = mutedForeground` (antd mặc định suy từ
  `colorTextBase` pha alpha ~45% → dưới 4,5:1; axe bắt ở mô tả `Empty` của bảng vai trò);
  `Button.colorError = destructive` (antd suy `palette[6]` từ seed → nền tối thành #cf6b5d, chỉ
  ~4,4:1 trên card; ghim về red-400 đạt 5,8:1 tối / 4,7:1 sáng).

**Typography/khoảng cách:** không đổi thang (typography/spacing đã tập trung ở `tokens.ts`); rà
các màn mới đều dùng cặp `text-sm` + `text-muted-foreground` cho phụ đề, tiêu đề mục
`text-sm font-semibold`, thân `text-base`, đúng quy ước TF.9.

## Ảnh bằng chứng

- Thư mục `screens/` — 9 ảnh (chụp bằng `apps/web/scripts/capture-polish.mjs`, script kiểm tra
  trạng thái ngay trước khi chụp; dữ liệu do script tự tạo trên tài khoản seed):
  `01-channel-dark`, `02-quick-switcher-dark`, `03-quick-switcher-empty-dark`,
  `04-search-results-dark`, `05-admin-settings-dark`, `06-dm-thread-dark`, `07-channel-light`,
  `08-quick-switcher-light`, `09-notify-prefs-error-light`.
- "Trước": ảnh chuẩn trạng thái của TF.9 ([../TF.9/screens](../TF.9/screens/), 2026-10-22) cho các
  màn đã tồn tại; "sau": các màn mới của v0.2.0 ở trên, có cả sáng/tối và trạng thái lỗi prefs
  thông báo. Không có ảnh trước/sau cùng một màn vì các màn này mới xuất hiện sau TF.9.

## Kiểm chứng

| Hạng mục            | Kết quả                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| axe (WCAG A/AA)     | `e2e/a11y.spec.ts` **4/4 pass** (1,2 phút) sau khi vá 2 vi phạm color-contrast |
| Chụp ảnh trạng thái | 13/13 ảnh của script (9 ảnh T6.7 + 4 ảnh T6.8), mỗi ảnh có bước `verify`       |
| i18n                | Khoá mới có đủ vi/en (parity check của `docs:check`/unit)                      |
| Unit/typecheck/lint | Xem mục full gate bên dưới                                                     |

## Review, giới hạn và tiếp tục

- Vi phạm axe tìm thấy là lỗi thật của token (không phải false positive): chữ phụ nền sáng và
  chữ nút danger nền tối đều dưới 4,5:1; đã sửa ở nguồn token thay vì vá từng chỗ.
- Chưa có ảnh trước/sau cùng màn (lý do ở trên); nếu cần so sánh pixel thì TF.13 (visual) sẽ làm.
- Bài học từ full web e2e lần một: `capture-polish.mjs` đăng ký partner mới mỗi lần chạy và để
  DM chưa đọc cho tài khoản seed → badge tổng của `dm.spec` lệch (rail hiện 4 thay vì 1), đỏ
  ngoài phạm vi code. Đã sửa script: partner **cố định** (đăng ký lần đầu, sau đó đăng nhập),
  đánh dấu DM đã đọc bằng `PUT /channels/:id/read` và xóa server tạm ở cuối — chạy lại nhiều lần
  không để lại trạng thái trên tài khoản seed.
- Chạy lại: `pnpm --filter web build`, bật API + `pnpm --filter web start`, rồi
  `WEB_PORT=3000 node apps/web/scripts/capture-polish.mjs`.

## Full gate cuối lô 2 (áp dụng cho T6.7–T6.10)

| Hạng mục    | Kết quả                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| format/docs | `format:check` sạch; `docs:check` sạch (liên kết ADR/evidence)                         |
| lint        | 0 lỗi, 14 cảnh báo có sẵn (không tăng)                                                 |
| typecheck   | 4/4 gói pass                                                                           |
| unit        | shared 80/80, api 307/307, web 271/271                                                 |
| API e2e     | **365/365 (43 file)**, có Mailpit                                                      |
| build       | 3/3 gói; `apps/web/.next` dựng mới dùng cho e2e production + Lighthouse                |
| bundle      | **248,2 KB ≤ 450 KB** (8 chunk ban đầu; 74 chunk tải lười, 791,4 KB)                   |
| web e2e     | **60 pass + 1 skip + 2 fail**, cả hai fail **pass khi chạy riêng** (chi tiết bên dưới) |

- Full web e2e (production, workers=1, 27,4 phút) đỏ 2 spec KHÔNG thuộc thay đổi của lô:
  `permalink.spec` đo mở permalink kênh 10k tin **8263 ms** so với trần 8000 ms của production
  (máy dev đang chạy Chrome + API + web; chạy riêng: **7924/1151 ms — pass**), và `settings.spec`
  chờ dòng chặn biến mất sau Bỏ chặn hết 10 s dưới tải cuối run (chạy riêng 2/2 pass, 3,0 phút).
  Cùng dạng chần tài nguyên/rate limit cuối run đã ghi ở TG.13/TG.22/TG.25; CI dùng DB + runner
  mới nên là phán quyết cuối.
- Sửa trong lúc chạy gate (đều là lỗi thật của test/script, không nới ngưỡng):
  `markdown.spec` dùng nhãn `code` cũ sau khi `markdown-text` chuyển sang `aria-label` i18n
  «Khối mã»; `quick-switcher.spec` Enter sau ArrowDown giả định option kế là `# long` nhưng spec
  khác trong cùng run đã tạo thêm server → bỏ Enter ở bước chỉ kiểm phím; `capture-polish.mjs`
  để lại DM chưa đọc cho tài khoản seed (đã ghi ở mục Review).

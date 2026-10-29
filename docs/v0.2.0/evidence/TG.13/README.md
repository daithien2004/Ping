# Evidence TG.13 — Trang cài đặt (giao diện, ngôn ngữ, thông báo, riêng tư, phím tắt)

- Ngày: 2026-10-29 (Asia/Saigon); nhánh `feat/tg13-settings`; base `5a897bb` (main sau TG.12).
- [ADR-0071](../../../adr/0071-user-settings-and-theme-preference.md): cài đặt người dùng lưu
  server + chế độ sáng/tối/hệ thống bằng `data-theme` (sửa một phần ADR-0023 — chế độ tối
  không còn chỉ theo hệ điều hành); ghi giới hạn ngôn ngữ cookie và phân chia cài đặt
  thiết bị vs server.

## Đã giao

**Shared** (commit hợp đồng đầu nhánh + bổ sung khi làm nốt):

- `schemas/settings.ts`: `SETTINGS_THEMES ['light','dark','system']`,
  `SETTINGS_DENSITIES ['comfortable','compact']`, `SETTINGS_FONT_SIZES ['sm','md','lg']`,
  `SETTINGS_LOCALES ['vi','en']` + zod atom của từng bộ; `updateUserSettingsSchema` PATCH
  semantics (mọi trường optional, refine chặn body rỗng, zod strip field lạ → 400) và
  `UserSettingsDto`. Thêm `USER_SETTINGS_DEFAULTS` — **một nguồn mặc định** cho GET lazy của
  API và store thiết bị của web (trước đó là ba bản sao dễ lệch).
- `schemas/dm.ts`: `UserPrivacyDto {dmAllow}` (GET mới của TG.13); `BlockedUserDto` /
  `BlockedUsersResponse` cho danh sách chặn.

**API**:

- Migration expand `20261029060000_tg13_user_settings`: bảng `UserSettings` (`userId` PK, FK
  `User` cascade), cột `TEXT` tường minh `theme | density | fontSize | locale` + DEFAULT khớp
  `USER_SETTINGS_DEFAULTS`. Hàng tạo **LAZY**: GET khi chưa có hàng trả mặc định, KHÔNG ghi —
  chỉ PATCH mới upsert (không rác hàng cho user không đụng cài đặt).
- `GET/PATCH /users/me/settings` — user-scoped từ JWT (không id trên path). PATCH đúng nghĩa
  PATCH: update chỉ mang trường được gửi, create điền mặc định trường thiếu; body rỗng /
  trường lạ / giá trị lạ (`theme:'blue'`, `locale:'jp'`) → 400 `VALIDATION_ERROR`, DB không đổi.
- `GET /users/me/privacy` — **lỗ hổng thật bắt khi review**: TG.9 chỉ có PATCH nên switch
  "nhận DM từ thành viên server" sẽ luôn hiển thị mặc định sau khi đổi ở thiết bị khác. Thêm
  endpoint đọc + unit test + assertion reload trong e2e. PATCH của TG.9 giữ nguyên.
- `GET /users/me/blocks` — danh sách người TÔI đã chặn, mới nhất trước, shape `BlockedUserDto`;
  bỏ chặn tái dùng `DELETE /users/:userId/block` của TG.9 (không thêm route). Ba route mới
  không có id trên path nên không vào `ID_ROUTES` (rule 16) — cách ly user phủ bằng e2e riêng.
- Unit `users.service.spec.ts` mới (+7: lazy default, PATCH semantics, privacy kể cả 404) và
  `dms.service.spec` (+2 listBlocks) → suite **254/254 (32 file)**. E2E riêng
  `test/user-settings.e2e-spec.ts` **9/9**.

**Web**:

- `features/settings/`: api (zod parse ở biên), hooks (optimistic cache + store, lỗi trả cả
  hai về bản trước), store thiết bị `ping.settings.applied` (localStorage, validate bằng schema
  shared, chống nháy sáng→tối khi mở tab mới), `SettingsSync` gắn sau `AuthGate` bơm giá trị
  server vào store (server là nguồn sự thật; ghi đè cache thiết bị lúc boot).
- Sáu mục: **Tài khoản** (tái dùng thẻ hồ sơ TG.7; email/mật khẩu/phiên là placeholder KHÔNG
  bấm được — TG.8); **Giao diện** (sáng/tối/hệ thống + mật độ + cỡ chữ, áp dụng NGAY, đồng bộ
  tab/thiết bị); **Ngôn ngữ** (PATCH rồi ghi cookie + reload — Next server đọc cookie);
  **Thông báo** (quyền trình duyệt, toggle thiết bị của TG.12, mức từng server + ghi đè kênh
  với reset); **Riêng tư** (switch `dmAllow` GET/PATCH + danh sách chặn với Bỏ chặn qua
  Popconfirm); **Phím tắt** (bảng phím tắt có thật trong app).
- `theme-provider`: `data-theme`/`data-density`/`data-font` trên `<html>`; antd resolve mode
  hiệu dụng (system → OS). `globals.css`: `@custom-variant dark` mở rộng cho cả `data-theme`
  và OS; khối token tối buộc (`html[data-theme='dark']`) nhân bản khối `@media` (CSS không
  gộp được selector với media — ghi chú tại chỗ); biến `--ping-root-font-size` (93.75/100/
  112.5%) và `--ping-message-py`/`--ping-message-leading` cho mật độ khối tin.
- Rail trái thêm nút Cài đặt cá nhân (`/settings`) — khác nút Cài đặt server ở sidebar kênh.
- **Bug thật bắt được (axe)**: mục chưa chọn của antd `Segmented` dùng `colorTextLabel` (chữ
  đã pha alpha) — trên palette này tụt dưới 4.5:1 (chủ đề/mật độ/cỡ chữ ở trang Giao diện).
  Vá token `Segmented.itemColor`/`itemHoverColor = foreground` trong `buildAntdTheme` (áp cho
  mọi Segmented của app, không riêng trang cài đặt) — a11y settings xanh lại.
- i18n vi/en thêm namespace `settings` (93 key; tổng 578/key mỗi bên, parity sạch); a11y
  aria-label + axe sáng/tối cho cả 6 trang.

## Kiểm chứng

| Hạng mục                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                        | **67/67**                                                                                                                                                                                                                                                                                                                                                                                                                    |
| API unit                           | **254/254** (32 file; +7 users settings/privacy, +2 listBlocks)                                                                                                                                                                                                                                                                                                                                                              |
| API e2e `user-settings`            | **9/9**: GET lazy mặc định + không tạo hàng → PATCH 1 trường → PATCH 2 trường giữ trường cũ → body rỗng/field lạ 400 → `locale 'jp'` 400 DB không đổi → privacy GET mặc định → PATCH `none` → user khác không bị ảnh hưởng → blocks rỗng/rỗng dần → 401 cả 4 route; cách ly 2 user                                                                                                                                           |
| Full API e2e                       | **338/338 (40 file)** — trước TG.13: 329/329 (39 file)                                                                                                                                                                                                                                                                                                                                                                       |
| Web unit                           | **242/242** (29 file; không thêm test thuần — hành vi cài đặt là tích hợp UI/server nên phủ bằng e2e theo tiêu chí nghiệm thu)                                                                                                                                                                                                                                                                                               |
| Web e2e `settings`                 | **1/1**: theme dark áp NGAY (`html[data-theme]` + nền body rời trắng) + API đã lưu + tab thứ hai (context khác) nhận dark; `dmAllow` off → bob `POST /dms` 403 `DM_BLOCKED`, reload switch vẫn off (GET privacy), chặn/bỏ chặn trong danh sách; đổi mức kênh qua UI → API khớp, reset → dòng biến mất; toggle thiết bị ghi localStorage; PATCH `theme:'blue'` 400 + UI đúng 3 lựa chọn; chụp 5 ảnh; ngôn ngữ en → reload giữ |
| Web e2e a11y `personal settings`   | **1/1**: 6 trang × sáng/tối, axe 0 violation                                                                                                                                                                                                                                                                                                                                                                                 |
| Full web e2e                       | _(điền sau khi chạy xong)_                                                                                                                                                                                                                                                                                                                                                                                                   |
| Lint/format/typecheck/build/bundle | lint 0 error (14 warning cũ); prettier sạch; typecheck sạch; build prod web đạt; **bundle 247,5 KB ≤ 450 KB**                                                                                                                                                                                                                                                                                                                |
| Migration                          | `20261029060000_tg13_user_settings` apply, in sync; `migrate diff --exit-code` no difference                                                                                                                                                                                                                                                                                                                                 |

## Lưu ý / quyết định sản phẩm

- **Ngôn ngữ**: cookie của thiết bị là nguồn render (server components đọc cookie), server là
  nguồn đồng bộ khi người dùng chọn. Đổi ngôn ngữ ở thiết bị khác KHÔNG tự reload trang đang
  mở — tự áp locale server lúc boot sẽ đè lựa chọn cục bộ của người chưa từng PATCH và có nguy
  cơ reload vòng lặp; ghi thành giới hạn đã biết ở ADR-0071 mục 7.
- **Tài khoản**: email/mật khẩu/phiên là placeholder "Sắp có" không bấm được — thuộc TG.8
  (vòng đời tài khoản) theo thứ tự Pha G; không dựng UI giả.
- **Mức thông báo theo server**: TG.12 hoãn UI server-level (rail chưa có menu ngữ cảnh); trang
  Thông báo TG.13 là chỗ đầu tiên hiển thị đủ mức server + ghi đè kênh, dùng đúng API/hook TG.12.
- **Ảnh TG.7/avatar-rail.png** bị spec chụp lại vì rail có thêm nút Cài đặt — commit kèm, không
  phải thay baseline để che lỗi. Ảnh TG.6/lightbox.png bị spec ghi lại với mã mời ngẫu nhiên
  khác (không liên quan TG.13) nên hoàn nguyên để không tạo nhiễu.
- **Flake hạ tầng gặp khi chạy**: lượt full web e2e đầu bị API `ECONNREFUSED` giữa chừng
  (dev server khởi động lại) làm một test a11y rơi vào global-error; chạy lại sau khi ổn định
  hạ tầng — ghi ở mục full web e2e. Không phải lỗi sản phẩm.

## Hồi quy CI 5a897bb (TG.12) — nguyên nhân + vá (`1c2cc24`)

CI main lần đầu đỏ từ TG.22 (web-e2e shard 3: `notification.spec`, `pin.spec`, `unread-ui`).
Chẩn đoán trên log CI: **không phải bug product** — (1) title từ TG.12 là TỔNG unread toàn
cục (mọi server + DM) nên mọi assertion title tuyệt đối `(1)/(2)` vỡ trước unread còn lại
của spec khác trên cùng shard (CI chạy nối tiếp trên cùng seed, kênh mute vẫn đếm unread theo
thiết kế); (2) `notification.spec` không mở kênh `#ping` (nơi step trước gửi mention) nên
unread của nó còn lại và title không bao giờ về `Ping`. Vá `1c2cc24`: `unread-ui` đổi 4
assertion sang `titleFor(delta)` theo baseline lúc đầu; `notification.spec` mở đủ 3 kênh bằng
`goto` trực tiếp (click sidebar flaky khi badge re-render churn — nợ profiling vòng render),
truth = `GET /servers/:id/unread` về 0, title chỉ assert render được (`Ping` hoặc `(N) Ping`).
Cả hai spec xanh riêng sau vá; run full: xem bảng trên.

**Bài học vận hành bổ sung (lượt full đầu trên máy dev)**: 14 fail hàng loạt do TỰ commit
trong lúc e2e chạy — `lint-staged --fix` của pre-commit hook đụng mtime `apps/api/src/**` →
nest watch "File change detected" → API restart giữa run → 8×ECONNREFUSED + pipeline upload
treo (pid đổi 35108→5412 trong log). Quy tắc: **mọi git commit dựng lại file mtime — cấm
commit/build/chỉnh cây khi e2e đang chạy**, kể cả commit tưởng "chỉ docs".

# Evidence TG.8 — Vòng đời tài khoản

- Ngày: 2026-10-30 (Asia/Saigon); nhánh `feat/tg8-account`; base `263e88c` (main sau TG.13).
- Không cần ADR theo kế hoạch (cột "PR + test"); thiết kế chốt ở hợp đồng shared + brief —
  một phát hiện quan trọng khi triển khai được ghi ở mục "Quyết định" dưới.
- Triển khai song song 2 agent (API + Web) theo quy trình đã chuẩn hóa.

## Đã giao

**Shared** (commit `ef30f28`): `schemas/auth.ts` thêm `verifyEmailSchema`,
`forgotPasswordSchema` (email chuẩn hóa lowercase), `resetPasswordSchema`,
`changePasswordSchema`, `resendVerificationSchema`, `SessionDto {id, device, createdAt,
lastUsedAt, current}`, `SessionsResponse`; `PublicUser.emailVerified: boolean`; errors
`VERIFY_TOKEN_INVALID` (một mã cho sai/hết hạn/đã dùng — không lộ lý do), `VERIFY_REQUIRED`.
Shared unit **70/70** (+3).

**API** (commit `ade9e39`):

- Migration expand `20261029100000_tg8_account_lifecycle`: `User.emailVerified` (seed = true —
  nếu không ~300 e2e cũ vỡ vì chính sách), `Session.device` + `lastUsedAt`, `EmailToken`
  (tokenHash SHA-256 unique, `usedAt` one-time, index userId); TTL verify 24 h / reset 30 phút.
- **Quyết định tích hợp (quan trọng)**: đọc kỹ auth module thấy refresh **đã là opaque token có
  hàng Session** (rotation + reuse-detection — không phải JWT stateless như giả định ban đầu)
  → không redesign, chỉ mở rộng: `device` = tóm tắt UA thuần ("Chrome trên Windows"), `lastUsedAt`
  cập nhật mỗi refresh thành công. **"Phiên hiện tại" theo claim `sid` trong access JWT** — cookie
  refresh có path `/api/v1/auth` nên trình duyệt không bao giờ gửi kèm tới `/users/*`; `sid` đã ký
  nên không spoof được; guard `liveCurrentSessionId` chống JWT cũ sau rotation nhận nhầm phiên đã
  thu hồi là "hiện tại".
- **Cổng Mailer** (`mailer/`): interface + `SmtpMailer` (nodemailer, `SMTP_URL` optional theo
  pattern TENOR_API_KEY) / `ConsoleMailer` (**không log body** vì chứa token); `@Global` module;
  mẫu thư vi/en, link `WEB_ORIGIN/verify?token=` và `/reset-password?token=`.
- `POST /auth/verify-email` (204 idempotent; sai/hết hạn/đã dùng → 400 `VERIFY_TOKEN_INVALID`),
  `POST /auth/password/forgot` (**luôn 202 cùng body** — chống dò tài khoản; rate limit
  **10/giờ theo IP VÀ email**, Redis SET NX EX + INCR, **fail-closed** — cửa phát thư mở miễn
  phí khi hạ tầng hỏng là email bombing), `POST /auth/password/reset` (thu hồi MỌI phiên),
  `POST /auth/verify-email/resend` (5/giờ), `PATCH /users/me/password` (sai current → 400 —
  không 401 để client không nhầm token chết mà đăng xuất; thu hồi các phiên KHÁC),
  `GET/DELETE /users/me/sessions(/:id)` (thu hồi phiên người khác → 404).
- **Chính sách chưa xác minh** ở tầng service (`assertEmailVerified` trong create server + cấp
  mã mời — điều kiện hồ sơ tài khoản, không phải luật role nên không đặt ở ability).
- **Nhiễu SMTP với e2e cũ**: mọi register fire-and-forget gửi thư thật làm nhiễu timing presence
  của realtime e2e (2 run đỏ trước khi điều tra) → e2e mặc định ConsoleMailer
  (`SMTP_URL=''` trong vitest config), riêng account-lifecycle tự bật SMTP→Mailpit trước khi
  boot và khôi phục trong afterAll.
- Unit +11 (suite **265/265**), e2e `account-lifecycle` **8/8** (đọc token THẬT từ Mailpit API:
  register → chặn tạo server `VERIFY_REQUIRED` → verify → tạo được; token dùng lại → 400;
  forgot có/không tồn tại cùng response; reset → login mật khẩu mới; sessions 2 phiên + revoke
  - 401; change-password thu hồi phiên khác; kiểm "token lưu BĂM trong DB"; IDOR thu hồi phiên
    người khác → 404), **full API suite 41/41 file**, IDOR 51 → 52.

**Web** (commit `c8e533c`):

- 3 route công khai trong route group `(auth)`: `/verify` (đọc `?token=`, tự gọi đúng 1 lần —
  guard ref chống StrictMode double-POST vì token một-lần-dùng; thành công → link login; lỗi →
  nút "Gửi lại thư" mở form email), `/forgot-password` (luôn câu trung lập "nếu email này tồn
  tại…", không lộ tồn tại), `/reset-password?token=` (mật khẩu mới + đối chiếu, luật từ schema
  shared). Login thêm link "Quên mật khẩu?".
- Mục **Tài khoản** thay placeholder TG.13 bằng UI thật: email + tag "Đã xác minh/Chưa xác
  minh" + resend; **Đổi mật khẩu** (3 ô + note "các phiên khác sẽ bị đăng xuất"); **Phiên đăng
  nhập** (thiết bị + lần dùng gần nhất, tag "Phiên này" không có nút, Thu hồi từng dòng +
  "Thu hồi các phiên khác" — Popconfirm).
- **Banner chưa xác minh** đầu app shell ("một số tính năng bị hạn chế" + nút gửi lại + link
  vào cài đặt; ẩn khi verified); `me` invalidate sau verify.
- `api-client`: đọc JSON chỉ khi body khác rỗng (forgot luôn 202, verify 204 — body rỗng).
- global-setup: verify seed user qua Mailpit + `postNoBody` (bug parse 204 của bản đầu) +
  fallback `scripts/verify-user.ts` khi máy dev không có `SMTP_URL`.
- i18n vi/en ~50 key; e2e `account.spec` **3/3 × 2 lần** (register → chặn → verify qua Mailpit
  → tạo được server; quên/đổi mật khẩu qua Mailpit rồi đổi NGƯỢC về password123 bằng chính
  form; phiên 2 context + thu hồi → context kia về login); unit **243/243** (+1 api-client).

## Kiểm chứng

| Hạng mục                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                        | **70/70** (+3 vòng đời)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API unit                           | **265/265** (33 file; +11 mailer/UA/token/rate-limit)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| API e2e `account-lifecycle`        | **8/8** (kịch bản chi tiết trên)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| IDOR                               | 52 route (+1), pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Full API e2e                       | **41/41 file pass** (run cuối agent, exit 0)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Web unit                           | **243/243** (+1 api-client)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Web e2e `account`                  | **3/3 × 2 lần**                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Full web e2e                       | **49 pass + 1 skip (28,3 phút), 3 fail đều pass solo trên stack sạch** (auth-and-shell, chaos-gap, permalink — API dev chết giữa run: 11×ECONNREFUSED từ test 42; máy dev không hoàn thành nổi full suite 1 process sau 5 run liền — pattern đã xác định từ TG.9; CI DB mới + prod build + runner sạch là phán quyết, precedent TG.9/12/13). Run trước đó: 17 fail (web chết + a11y tag contrast ĐÃ VÁ `3aa5898` + admin-members hydration 30s ĐÃ VÁ) — mọi spec nghi ngờ đều xanh solo |
| Lint/format/typecheck/build/bundle | lint 0 error; prettier sạch; typecheck sạch; build prod web đạt; **bundle 247,7 KB ≤ 450 KB** (+0,2 KB so với TG.13)                                                                                                                                                                                                                                                                                                                                                                    |
| Migration                          | `20261029100000_tg8_account_lifecycle` apply, in sync; `migrate diff --exit-code` no difference                                                                                                                                                                                                                                                                                                                                                                                         |

## Thư không vào spam — thử nghiệm thực (tiêu chí nghiệm thu plan)

**Thư không vào spam (tiêu chí nghiệm thu plan)**: ở dev, Mailpit nhận trọn vẹn thư verify +
reset (e2e đọc token từ Mailpit API chạy 2 lần xanh). Thử nghiệm spam thật cần SMTP dịch vụ
ngoài — thuộc giai đoạn staging theo ADR-0059; mẫu thư vi/en + cổng Mailer đã sẵn cho lúc đó.

## Lưu ý / quyết định

- **Auto-verify khi `NODE_ENV=test`**: ~25 spec cũ đăng ký user mới rồi tạo server ngay sẽ dính
  `VERIFY_REQUIRED` — sửa từng spec là diff ~100 dòng lặp; thay vào đó `register` gán
  `emailVerified: true` khi test (repo đã có precedent phân nhánh NODE_ENV=test ở
  attachment-worker/indexer); chính sách luôn chạy và được test riêng ở account-lifecycle bằng
  cách đặt lại cờ qua Prisma.
- **SMTP_URL**: dev muốn đi đường Mailpit thật thì thêm `SMTP_URL=smtp://127.0.0.1:1025` vào
  `.env` (không commit); thiếu → ConsoleMailer (chức năng vẫn chạy trọn, chỉ không có thư).
- **SMTP nhiễu e2e cũ**: mỗi register gửi thư fire-and-forget làm nhiễu timing presence — e2e
  mặc định ConsoleMailer (giải pháp gốc, ghi chi tiết trên).
- Thư thật qua SMTP dịch vụ ngoài (staging) thuộc giai đoạn có staging theo ADR-0059; Mailpit ở
  dev + mẫu thư vi/en đã sẵn cho lúc đó.

# Evidence `T3.7` — `Mọi chuỗi mới có vi/en; lazy route quản trị; bundle ≤ 450 KB`

- Ngày/giờ: 2026-10-24 (UTC+7).
- Người thực hiện: agent (ZCode); task xác minh, không đổi code.
- Task, nhánh: T3.7 — `chore/t3.7-i18n-lazy-verify` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `d61bc23` (merge T3.6).
- Commit code được kiểm: `d61bc23` — nhánh này chỉ thêm tài liệu.
- Môi trường: Windows, Node/pnpm theo `pnpm-lock.yaml`.

## Đối chiếu tiêu chí

T3.7 yêu cầu: "Mọi chuỗi mới có vi/en; tải lười (lazy) các route quản trị để giữ bundle ban đầu
≤ 450 KB gzip. Báo cáo bundle trong CI." Cả ba cơ chế đã tồn tại từ các task trước và đang chạy:

| Tiêu chí                           | Cơ chế hiện có (vị trí)                                                                                                                                                                                                                                 | Kết quả |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Mọi chuỗi mới có vi/en             | Test parity `apps/web/src/i18n/messages.test.ts`: cây key lá của `en.json` phải bằng đúng `vi.json`, không có bản dịch rỗng; `useTranslations` sinh kiểu từ JSON nên **thiếu key = typecheck đỏ** (chứng minh: TF.10 evidence, "i18n là hợp đồng kiểu") | pass    |
| Lazy route quản trị                | App Router tự code-split theo route: `/servers/[serverId]/settings` chỉ tải chunk khi vào trang; đo theo `build-manifest.json` (ADR-0058) nên chunk quản trị không nằm trong JS ban đầu; drawer chi tiết thành viên tách thêm bằng `next/dynamic`       | pass    |
| Bundle ≤ 450 KB + báo cáo trong CI | `pnpm --filter web check:bundle` nằm trong job `verify` của `.github/workflows/ci.yml`; đo JS ban đầu ≤ 450 KB, chunk ban đầu ≤ 100 KB, chunk theo yêu cầu ≤ 160 KB                                                                                     | pass    |

## Kiểm chứng trên commit `d61bc23`

| Lệnh                                                                     | Kết quả                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm --filter web check:bundle`                                         | pass — JS tải ban đầu **243.9 KB** gzip (8 chunk), tải theo yêu cầu 620.8 KB (41 chunk) |
| `pnpm --filter web test`                                                 | pass — 131 test, gồm `messages.test.ts` (parity vi/en, không rỗng)                      |
| CI main run của merge T3.6 (`d61bc23`), job `verify` chạy `check:bundle` | xem dòng status                                                                         |

Đủ chuỗi mới của Pha 3 (server name, channels, roles, members/kick, audit, invite) đã đi qua
cơ chế trên: mỗi task trong Pha 3 thêm key vào **cả** `vi.json`/`en.json` song song (T3.1–T3.6
evidence), parity test + typecheck xanh trên từng commit.

Không chạy lại e2e ở local cho task này: không đổi code runtime; e2e web/API đã xanh trên cùng
commit trong T3.6 và CI sẽ chạy lại trên merge.

## Review, giới hạn và tiếp tục

- Phát hiện: không có. `check:bundle` là chốt chặn CI nên vi phạm ngân sách sau này sẽ đỏ PR.
- Giới hạn: visual regression (TF.13) chưa làm nên chưa có ảnh; đây là việc của Pha 6/TF.13.
- Rollout/rollback: docs-only, không rủi ro runtime.
- Trạng thái: T3.7 **done** — Pha 3 hoàn tất. Tiếp theo theo thứ tự thi công (ADR-0059):
  Pha 4 (unread/mention/gap recovery/FTS) → Pha G.

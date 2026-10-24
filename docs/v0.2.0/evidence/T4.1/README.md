# Evidence `T4.1` — `ADR-0043 + migration ChannelReadState/MessageMention; parse mention khi tạo/sửa tin`

- Ngày/giờ: 2026-10-24 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch (kèm các quyết định ADR) trong phiên
  cùng ngày.
- Task, nhánh: T4.1 — `feat/t4.1-mention-unread` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `2ce6dc2` (merge T3.7).
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant), Node/pnpm theo
  `pnpm-lock.yaml`.

## Thay đổi

- **ADR-0043** (`docs/adr/0043-unread-mention.md`, accepted theo duyệt kế hoạch): đếm unread
  bằng DB có trần (không Redis), mention do server parse, bit `MENTION_EVERYONE` chặn cả
  @everyone lẫn @role, `@user` luôn cho phép, sửa tin xoá rồi ghi lại mention trong transaction.
- **Shared:** `Permissions.MENTION_EVERYONE` (512n), `Limits.MENTIONS_PER_MESSAGE = 20`.
- **DB:** migration `20261024145804_unread_mention` — bảng `ChannelReadState` (PK
  `(memberId, channelId)`, `lastReadMessageId?`, FK cascade, index `memberId`) và
  `MessageMention` (id surrogate + unique `(messageId, kind, mentionedMemberId, roleId)`,
  index `(mentionedMemberId, messageId DESC)`, FK cascade Message/Member/Role). Không backfill —
  bảng rỗng tới khi T4.2 có endpoint ghi. Lệch so với dự thảo plan 5.1 (PK composite có cột
  NULL) có ghi lý do trong ADR.
- **Parser** (`mention-parser.ts`, hàm thuần): token `@` sau ranh giới từ (email `a@b`,
  `@@` không match), charset `[A-Za-z0-9_.-]{3,32}` khớp luật username, token dài hơn 32 ký tự
  bị loại cả chuỗi (lookahead chặn match một phần), trần 20 mention khác nhau (`@everyone`
  tính vào trần).
- **Resolver** (`mention-resolver.ts`): giải nghĩa theo thứ tự @everyone → username của thành
  viên server (user không tham gia không tính) → tên role (bỏ role `@everyone` mặc định; token
  trùng cả username lẫn tên role chỉ tính user). Thiếu `MENTION_EVERYONE` (owner/
  ADMINISTRATOR ngầm có) thì không ghi @everyone/@role — tin vẫn gửi bình thường.
- **MessagesService:** `create`/`update` parse + ghi mention **cùng transaction** với tin;
  sửa tin = xoá toàn bộ hàng cũ rồi ghi lại; quyền người gửi lấy qua `AbilityFactory.contextFor`
  (cache 30 s). Không đổi DTO/event (`mentionsMe` thuộc T4.2).
- **Web:** nhóm "Tin nhắn" của trình sửa quyền thêm checkbox `MENTION_EVERYONE`; i18n vi/en.

## Kiểm chứng

| Tiêu chí đạt                                              | Lệnh/cách thử                                                                                                                                            | Kết quả                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Parser xử lý email/@@/trần/toàn cục                       | `vitest run src/modules/messages/mention-parser.spec.ts`                                                                                                 | **11/11 pass**                                    |
| `@everyone` chỉ khi có quyền                              | e2e `mentions.e2e-spec.ts`: plain (không bit) → không có hàng; privileged (bit) → hàng `everyone`; owner → hàng `everyone`; tin vẫn 201 cả ba trường hợp | pass                                              |
| `@role` có kiểm quyền; `@user` luôn ghi                   | e2e: `@mods` của plain không ghi, của privileged ghi đúng `roleId`; `@user` ghi theo member id; username không phải member không ghi                     | pass                                              |
| Sửa tin cập nhật mention                                  | e2e: đổi nội dung `@user` → `@everyone` → hết mention: hàng được thay đúng từng bước                                                                     | pass                                              |
| Soft-delete giữ hàng mention (T4.2 phải join `deletedAt`) | e2e: tin xóa mềm vẫn còn hàng — ghi chú thiết kế cho tầng đếm                                                                                            | pass                                              |
| Hồi quy API                                               | `pnpm --filter api test:e2e`                                                                                                                             | **174/174 pass** (27 file; 166 cũ + 8 mới)        |
| Hồi quy unit + build web                                  | `pnpm test`, `pnpm --filter web test`, `pnpm --filter web build`                                                                                         | pass (web 131; build xanh)                        |
| Lint/typecheck/format/docs                                | `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm docs:check`                                                                                    | pass                                              |
| Web e2e (role editor có checkbox mới)                     | `pnpm --filter web exec playwright test --workers=1`                                                                                                     | **27 pass, 1 skip** (local-deployment, cần HTTPS) |

Chạy lại: Docker đang chạy; `vitest run src/modules/messages/mention-parser.spec.ts` trong
`apps/api`; e2e mention qua `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts
test/mentions.e2e-spec.ts`.

## Review, giới hạn và tiếp theo

- Phát hiện khi làm: (1) migration đầu bị lỗi type FK (`memberId` thiếu `@db.Uuid`) — bỏ
  migration chưa apply, sửa schema, tạo lại; (2) xóa tin là soft-delete nên hàng mention còn
  lại — không phải lỗi, đã ghi chú cho T4.2 phải ràng buộc `message.deletedAt = null` khi đếm.
- Mỗi tin tạo/sửa thêm ~2 query tra member/role (nếu có token mention) — nằm trong transaction
  sẵn có; đo lại tải ở T6.1.
- T4.2 tiếp theo: `PUT /channels/:id/read`, `GET /servers/:id/unread` (đếm có trần 100),
  event `read.updated`, cờ `mentionsMe` trên `message.created`.

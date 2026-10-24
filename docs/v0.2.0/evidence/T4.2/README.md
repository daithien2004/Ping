# Evidence `T4.2` — `PUT /channels/:id/read`, `GET /servers/:id/unread`, `read.updated`, mention realtime

- Ngày/giờ: 2026-10-24 → 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên 2026-10-25 (gồm quyết định
  tách event `mention.created` thay vì cờ `mentionsMe` trên `message.created`).
- Task, nhánh: T4.2 — `feat/t4.2-read-unread` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `46a9db0` (main sau T4.1).
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant).

## Thay đổi

- **Shared:** `markChannelReadSchema` (`{messageId: uuid}`), `ChannelUnreadDto`, hai event mới
  `read.updated` (`{channelId, lastReadMessageId}`) và `mention.created`
  (`{messageId, channelId, serverId}`).
- **API:**
  - `PUT /channels/:channelId/read` (`ReadStateService.markRead`) sau `@CheckAbility(['view',
'Message'])`: xác minh tin thuộc đúng channel (404), cursor **chỉ tiến không lùi** bằng
    `createMany(skipDuplicates)` + `updateMany` điều kiện `lastReadMessageId < messageId` — hai
    lệnh idempotent, an toàn khi hai tab ghi song song; 204; phát `read.updated` tới phòng
    `user:<id>` khi có thay đổi (đồng bộ nhiều tab).
  - `GET /servers/:serverId/unread` sau `@CheckAbility(['view','Server'])`: **một** truy vấn
    SQL thô (lateral subselect, `Prisma.sql` parameter hóa) cho mọi channel: unread = tin chưa
    xóa mềm sau cursor **không tính tin của chính người gọi**; mentionCount = hàng mention sau
    cursor khớp (mình trực tiếp / role của mình / everyone); cả hai `LEAST(...,100)` — trần
    theo ADR-0043; đã ràng buộc `message.deletedAt IS NULL` đúng ghi chú T4.1. Chưa có read
    state = cả channel chưa đọc.
  - `RealtimeService.emitToUser` (phòng `user:<id>`); `MessagesService` sau khi broadcast
    `message.created` tới phòng channel (giữ nguyên — ranh giới quyền) phát `mention.created`
    tới từng user được mention (≤ 20 tin mention mở thành: user trực tiếp / member của role /
    mọi member với everyone), chỉ sau khi kiểm `view Message` (cache 30 s); fire-and-forget —
    ping lỗi không làm hỏng đường gửi. Không phát lại khi sửa/xóa tin.
- **Lệch có chủ đích với plan 5.3** (được duyệt): thay vì cờ `mentionsMe` trên `message.created`
  theo từng người nhận, dùng event riêng `mention.created`. Lý do: (1) phát `message.created`
  theo từng user phải bỏ cơ chế phòng `channel:<id>` đang là ranh giới quyền (room chỉ cho người
  có `VIEW_CHANNEL`, `refreshAccess` dọn khi quyền đổi) hoặc kiểm ability từng member mỗi tin;
  (2) chi phí phát × số thành viên thay vì 1 lần broadcast. Mục tiêu "không rò danh sách mention
  của người khác" vẫn đạt: event chỉ tới người được nhắc.
- **IDOR:** thêm `put /channels/:id/read` và `get /servers/:id/unread` vào `ID_ROUTES` (25) +
  dòng tấn công outsider.

## Kiểm chứng

| Tiêu chí đạt                                                                 | Lệnh/cách thử                                                    | Kết quả                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Đếm unread đúng (không tính tin mình, kênh khác 0)                           | e2e `read-state.e2e-spec.ts` test 1                              | pass                          |
| mentionCount theo user/role/everyone; người không liên quan chỉ đếm everyone | test 2 (reader 3, other 1)                                       | pass                          |
| PUT read chỉ tiến; cursor cũ không lùi; messageId sai channel 404            | test 3                                                           | pass                          |
| Tin xóa mềm không đếm                                                        | test 4                                                           | pass                          |
| Trần đếm 100 (seed 105 tin)                                                  | test 5                                                           | pass                          |
| `read.updated` đồng bộ 2 tab (hai socket cùng user đều nhận đúng payload)    | test 6                                                           | pass                          |
| `mention.created` chỉ tới người được nhắc (socket người khác không nhận)     | test 7                                                           | pass                          |
| IDOR (outsider 403 cả hai endpoint; route-coverage 25)                       | test 8 + `idor.e2e-spec.ts`                                      | pass (5/5)                    |
| Hồi quy API                                                                  | `pnpm --filter api test:e2e`                                     | **182/182 pass** (28 file)    |
| Hồi quy web                                                                  | `pnpm --filter web typecheck/test/build` + e2e                   | pass; e2e **27 pass, 1 skip** |
| Bộ chuẩn                                                                     | `pnpm lint`, `pnpm format:check`, `pnpm docs:check`, `pnpm test` | pass                          |

Chạy lại: Docker đang chạy; `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts
test/read-state.e2e-spec.ts`.

## Review, giới hạn và tiếp theo

- Phát hiện khi làm: (1) Prisma không nhận compound selector `memberId_channelId` trong
  `updateMany` — đổi sang filter trường phượt; (2) e2e 2-tab phải gắn listener trước khi PUT
  (event phát trong lúc xử lý request); (3) kỳ vọng "unread của other" ban đầu sai — tin của
  reader vẫn là unread với người khác (loại trừ chỉ áp dụng cho chính người gọi), đã sửa test.
- `@everyone` trong server rất đông: mỗi tin mention-everyone = một query member + N ability
  check (cache 30 s) + N emit — đo lại ở T6.1; nếu chậm, lọc theo socket đang online trước.
- Chưa có UI badge (T4.3) — web hiện bỏ qua 2 event mới (socket.io client bỏ qua event không
  đăng ký listener).
- T4.3 tiếp theo: badge server/channel + vạch "tin mới" + badge mention, dùng `GET unread` khi
  mở app/reconnect và `message.created`/`mention.created`/`read.updated` để cập nhật tinh.

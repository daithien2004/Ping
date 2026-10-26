# ADR-0064: Cảm xúc trên tin nhắn (message reactions)

Status: accepted — quyết định nằm trong kế hoạch Pha G (TG.2) được OWNER duyệt
Date: 2026-10-26

## Context

TG.2 cần cho thành viên thả/gỡ cảm xúc trên tin nhắn, thấy tổng số người đã thả, biết mình đã
thả chưa, và xem danh sách người thả — cập nhật realtime giữa các tab/người dùng.

Ràng buộc hiện có:

- Quyền theo bitmask (ADR-0004) và ability CASL dùng chung `@ping/shared`; chưa có bit riêng cho
  cảm xúc.
- Mọi danh sách dùng keyset theo `id` (ADR-0044); tin nhắn tải theo trang 50, không N+1.
- Realtime đi qua room channel; client chỉ được ghi cache từ domain hook (không component).
- DB đổi bằng migration expand (không sửa cột cũ trong cùng bước).
- Mọi chữ trên UI qua i18n vi/en; bundle ban đầu không được tăng vì tính năng này.

Câu hỏi thiết kế chính: lưu cảm xúc thế nào để **idempotent** (double-click, retry mạng), đếm
đúng khi nhiều người thao tác đồng thời, và không biến mỗi trang tin thành N+1 truy vấn.

## Decision

**Một bảng `MessageReaction` (unique theo tin + người + emoji), bit quyền `ADD_REACTIONS`, API
`PUT`/`DELETE` idempotent, và event realtime mang `count` chuẩn.**

1. **DB**: bảng `MessageReaction(id uuid(7), messageId, userId, emoji, createdAt)`.
   `@@unique([messageId, userId, emoji])` là bất biến "một người thả một emoji một lần"; gỡ =
   xóa hàng (không soft-delete). FK `ON DELETE CASCADE` cho cả tin và user. Index
   `(messageId, emoji)` cho tổng hợp và `(messageId, userId)` cho cờ "của tôi".
2. **Quyền**: bit mới `ADD_REACTIONS = 1024n`. Ability cho `create Reaction` khi có **cả**
   `VIEW_CHANNEL` và `ADD_REACTIONS`; owner luôn được. `@everyone` của server mới nhận bit này
   lúc tạo; migration backfill `UPDATE "Role" SET permissions = permissions | 1024 WHERE
isDefault` để server cũ không bị khóa tính năng.
3. **API** (đều qua `@CheckAbility` và IDOR):
   - `PUT /messages/:messageId/reactions/:emoji` — thả; thả lại cùng emoji trả tổng hợp hiện tại,
     **không tạo hàng mới, không phát event lần hai** (`createMany skipDuplicates`).
   - `DELETE /messages/:messageId/reactions/:emoji` — gỡ; gỡ lại trả tổng hợp hiện tại, không
     event (`deleteMany` đếm số hàng).
   - `GET /messages/:messageId/reactions/:emoji?after&limit` — danh sách người thả, keyset tăng
     dần theo **id hàng cảm xúc**, trả `users`, `total`, `hasMore`, `nextCursor`.
   - Cả ba trả/đọc `MessageReactionSummary`/`ReactionUsersPage` từ `@ping/shared`; tin không tồn
     tại hoặc đã xóa mềm → `404`.
4. **Allowlist emoji** ở `@ping/shared` (`isAllowedReactionEmoji`, `reactionEmojiSchema`): sinh
   từ đúng bộ dữ liệu picker của web (276 emoji), cho thêm **một** modifier Fitzpatrick ở cuối.
   Lý do: param đường dẫn là đầu vào công khai — không cho lưu text/HTML/emoji lạ vào DB; test
   dữ liệu web giữ hai nguồn không lệch. Vi phạm → `400 REACTION_EMOJI_INVALID`.
5. **Giới hạn**: tối đa `Limits.REACTIONS_PER_MESSAGE = 20` **loại** emoji khác nhau trên một
   tin; thả lại emoji đã có vẫn được. Vượt → `400 REACTION_LIMIT_REACHED`. Thêm
   `ReactionRateLimiter` 30 thao tác/10 giây cho mỗi `(user, channel)` (fail-open khi Redis chết,
   cùng quy tắc với `MessageRateLimiter`). Cả thêm và gỡ lấy advisory transaction lock theo
   `messageId` trong Postgres trước khi đọc/ghi: hai instance không thể cùng vượt trần 20 loại,
   và số đếm được tính sau khi writer trước đã commit.
6. **Tổng hợp khi đọc**: mỗi trang tin dùng **hai truy vấn** bất kể số tin — `groupBy
(messageId, emoji)` đếm, và một `findMany` lấy hàng của người xem để đặt `me`. Không N+1;
   thứ tự `count` giảm dần rồi emoji để mọi client thấy cùng thứ tự. `MessageDto` thêm
   `reactions: MessageReactionDto[]` (`{emoji, count, me}`).
7. **Realtime**: `reaction.added` / `reaction.removed` phát vào room channel với
   `{messageId, channelId, emoji, userId, count}`. `count` là tổng **sau** thao tác — client lấy
   làm nguồn chuẩn thay vì tự cộng/trừ; chỉ đổi cờ `me` khi `userId` là chính người xem, nên
   event của người khác không làm sai "tôi đã thả chưa".
8. **Web**:
   - Cache: `applyReaction` (ghi đè count chuẩn, `count <= 0` thì bỏ nhóm), `toggleReaction`
     (optimistic ±1 cho đúng emoji), `setReactions` (response API thay toàn bộ nhóm).
   - `createMessageActions.react` cập nhật optimistic trước, rồi thay bằng response chuẩn; lỗi
     4xx hoàn tác đúng emoji đó nếu cache chưa bị writer khác sửa, lỗi mạng/5xx thì invalidate
     (server có thể đã ghi). Nếu cache đổi trong lúc chờ HTTP, giữ cache mới và đối soát lại
     qua REST thay vì ghi đè snapshot cũ hoặc bỏ qua một rollback không còn an toàn.
   - UI: mỗi nhóm là **viên thuốc tách đôi** — phần emoji thả/gỡ, phần số mở danh sách người
     thả (phân trang bằng `nextCursor`). Nút "+" mở hộp chọn dùng lại `features/emoji` qua
     `next/dynamic` (dataset chỉ tải khi mở). Emoji đang chờ response bị disable để đếm không
     nhảy loạn; mọi nút thả trên cùng tin bị khóa trong lúc mutation đang chờ, pill vẫn hiển
     thị khi không có quyền thả.
   - i18n vi/en cho toàn bộ nhãn; `admin.permissions` thêm `addReactions`.

Luồng thả một cảm xúc:

```text
browser  click 👍  → toggleReaction (optimistic: count+1, me=true)
   │
   ├─ PUT /messages/:m/reactions/👍
   │     ├─ allowlist + tin còn sống + rate limit + trần 20 loại
   │     ├─ createMany skipDuplicates (idempotent)
   │     └─ emit reaction.added {count chuẩn}  ──► mọi tab/kênh
   └─ response {messageId, reactions[]} → setReactions (chuẩn hoá cả trang)
```

## Alternatives

- **Cột JSON `reactions` trên `Message`**: đọc nhanh một hàng nhưng không unique được theo
  người, ghi đồng thời phải read-modify-write (mất cảm xúc khi hai người thả cùng lúc), và
  không phân trang người thả bằng keyset.
- **Bảng nối không có unique, tự kiểm trước khi insert**: double-click/retry vẫn tạo hàng trùng
  (race), count sai; unique ở DB là chỗ duy nhất chặn được.
- **Soft-delete cảm xúc**: bảng phình theo lịch sử gỡ, mọi truy vấn phải lọc `deletedAt`, và
  không có nhu cầu khôi phục — xóa hàng là đủ.
- **Trả `count`/`me` bằng N+1 hoặc include**: một trang 50 tin × 20 emoji = 1.000 truy vấn;
  hai truy vấn theo lô giữ chi phí O(số cảm xúc của trang).
- **Client tự cộng/trừ theo event**: hai tab hoặc event đến trễ làm lệch vĩnh viễn; `count`
  trong event là tổng sau thao tác nên hội tụ.
- **Cho phép mọi chuỗi làm emoji**: param công khai, DB thành nơi chứa text/HTML tùy ý; allowlist
  sinh từ picker giữ đúng tập UI có thể chọn.
- **Không có bit quyền riêng**: dùng `SEND_MESSAGES` sẽ khiến server tắt gửi tin (read-only) mất
  luôn cảm xúc — hai hành vi khác nhau cần hai bit.

## Consequences

- `MessageDto` có thêm trường bắt buộc `reactions` — mọi nơi dựng DTO (list/around/create/retry/
  update) phải điền; test fixture cũ cập nhật. Client cũ bỏ qua trường này.
- `Role.permissions` của `@everyone` trên server cũ đổi giá trị (thêm 1024); test quyền hiệu lực
  và UI quản trị phải phản ánh bit mới.
- Xóa cứng tin/user kéo theo cảm xúc; xóa mềm tin không xóa cảm xúc nhưng API đọc/ghi đều trả
  `404` cho tin đã xóa mềm.
- Hai truy vấn tổng hợp mỗi trang là chi phí cố định; trang 50 tin không phụ thuộc số cảm xúc.
- Event realtime chỉ phát khi trạng thái **thực sự** đổi, nên retry/idempotent không tạo nhiễu.
- Giới hạn 20 loại/tin là quyết định sản phẩm (giống Discord); người dùng nhận mã lỗi riêng để
  UI báo rõ thay vì "invalid".
- Chưa có "reaction role" hay cảm xúc trên DM/thread — ngoài phạm vi TG.2.

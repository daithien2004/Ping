# ADR-0066: Ghim tin nhắn (message pins)

Status: accepted — quyết định nằm trong kế hoạch Pha G (TG.3) được OWNER duyệt ngày 2026-10-26
Date: 2026-10-26

## Context

TG.3 cần cho người quản lý tin **ghim** một tin quan trọng trong channel, xem danh sách ghim,
bỏ ghim, có ghi nhật ký hành động và đồng bộ realtime giữa các tab.

Ràng buộc hiện có:

- Bit quyền `MANAGE_MESSAGES` đã tồn tại (ADR-0004) nhưng ability chỉ dùng nó cho `delete Message`;
  `update Message` là quyền của **tác giả**. Mở `update` cho moderator sẽ cho sửa tin người khác —
  hai test hiện có (`ability.spec.ts`, `ability.test.ts` của web) chặn đúng điều đó.
- Mọi danh sách có thể lớn dùng cursor; danh sách bị chặn bằng trần trả mảng thuần
  (`docs/api-conventions.md` §5).
- Hành động nhạy cảm phải ghi `AuditLog` (quy tắc 11); DB đổi bằng migration expand.
- Realtime đi qua room channel; client chỉ ghi cache trong domain hook.

## Decision

**Ghim là hai cột trên `Message` (`pinnedAt`, `pinnedById`), tối đa 50 tin/channel, quyền
`MANAGE_MESSAGES`, audit `MESSAGE_PIN`/`MESSAGE_UNPIN`, event `message.pinned`/`message.unpinned`.**

1. **DB**: `Message.pinnedAt DateTime?`, `Message.pinnedById UUID?` (FK `User`,
   `ON DELETE SET NULL`: xóa tài khoản không kéo sập tin đã ghim), index
   `(channelId, pinnedAt desc)` cho danh sách ghim. Migration expand, không đổi cột cũ. Chọn cột
   trên `Message` (đúng plan TG.3) thay vì bảng `MessagePin`: trạng thái ghim là thuộc tính của tin,
   mọi `MessageDto` cần nó, và "một tin ghim một lần" là bất biến tự nhiên của cột.
2. **Quyền**: bit có sẵn `MANAGE_MESSAGES` **và** `VIEW_CHANNEL`; thêm subject `Pin` vào
   `defineAbilityFor` với `create Pin` (ghim) / `delete Pin` (bỏ ghim). Không mở `update Message`
   cho moderator — ghim không phải sửa nội dung.
3. **API**:
   - `PUT /messages/:messageId/pin` → 200 `{ messageId, channelId, pinnedAt, pinnedById }`.
   - `DELETE /messages/:messageId/pin` → 200 cùng hình dạng, `pinnedAt: null`.
   - `GET /channels/:channelId/pins` → mảng `[{ message, pinnedAt, pinnedBy }]`, mới ghim trước,
     tối đa 50.
   - **Lệch plan một chỗ có chủ đích**: plan ghi `PUT/DELETE /channels/:id/pins/:messageId`; dùng
     `/messages/:messageId/pin` để đồng nhất với reaction (`/messages/:id/reactions/:emoji`), và
     `messageId` đủ để suy ra channel nên không có hai nguồn chân lý cho cùng một thao tác.
4. **Idempotent**: ghim tin đã ghim (hoặc bỏ ghim tin chưa ghim) trả 200 với trạng thái hiện tại,
   **không** ghi audit và **không** phát event lần hai. Client retry an toàn.
5. **Trần 50/channel** (`Limits.PINS_PER_CHANNEL`) giữ bằng
   `pg_advisory_xact_lock(hashtext(channelId))` quanh bước đếm + ghi, nên hai instance không cùng
   vượt trần. Vượt → `400 PIN_LIMIT_REACHED` (mã riêng trong `ErrorCodes` + i18n vi/en). Trần chỉ
   đếm tin `deletedAt IS NULL`.
6. **Xóa mềm**: xóa tin (tác giả hoặc moderator) gỡ `pinnedAt/pinnedById` trong cùng transaction;
   tin đã xóa không nằm trong danh sách ghim và không chiếm chỗ trong trần. Không phát thêm
   `message.unpinned` cho tin đã xóa — `message.deleted` đã đủ để client bỏ tin khỏi mọi cache.
7. **Audit**: `MESSAGE_PIN`/`MESSAGE_UNPIN` (hai migration enum), `targetId` = id tin,
   `metadata = { channelId }`, ghi trong cùng transaction với việc đổi trạng thái.
8. **Realtime**: `message.pinned { messageId, channelId, pinnedById, pinnedAt }` và
   `message.unpinned { messageId, channelId }` phát vào room `channel:<id>` sau commit. Trạng thái
   trong event là nguồn chuẩn; client không tự suy `pinnedById`.
9. **Web**: menu tin nhắn có "Ghim"/"Bỏ ghim" (chỉ hiện theo ability + `ready`), icon ghim trên tin
   đã ghim, nút ở header kênh mở panel danh sách ghim (tải lười, rỗng/lỗi/loading đủ trạng thái,
   bấm để nhảy tới permalink TG.5). Cache ghim là hàm thuần `applyPin` có test.

## Alternatives

- **Bảng `MessagePin` riêng**: cho phép nhiều hàng/tin và metadata riêng, nhưng thêm một join cho
  mọi lần đọc tin trong khi nhu cầu chỉ là "ghim hay không"; trạng thái phải đồng bộ với `Message`
  khi xóa mềm.
- **Đánh dấu bằng `Message.kind`/cột JSON**: không đánh index theo thời điểm ghim được, và trộn
  trạng thái quản trị vào nội dung tin.
- **Dùng `update Message` với `MANAGE_MESSAGES`**: đơn giản nhưng mở đường sửa tin người khác —
  sai mô hình quyền.
- **Phân trang danh sách ghim**: trần 50 làm phân trang vô nghĩa; mảng thuần đơn giản hơn cho cả
  hai phía.
- **Dùng `limitReached()` chung**: client không phân biệt được "hết chỗ ghim" với lỗi validate khác;
  mã riêng cho phép web báo đúng lý do.

## Consequences

- `MessageDto` có thêm hai trường bắt buộc → mọi fixture/DTO dựng tay phải cập nhật (typecheck ép).
- Trần 50 là quyết định sản phẩm (giống Discord); người dùng nhận đúng mã lỗi khi đầy.
- Hai migration enum: mỗi lần deploy thêm giá trị `AuditAction`; UI quản trị có nhãn mới
  (`ACTION_KEYS` là `satisfies Record<AuditAction, string>` nên thiếu nhãn là lỗi typecheck).
- Xóa mềm tốn thêm một `UPDATE` trên cùng hàng — không đổi số transaction.
- Chưa có "ghim tự động theo reaction" hay giới hạn theo role — ngoài phạm vi TG.3.

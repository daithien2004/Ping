# Quy ước API

Áp dụng cho REST (`/api/v1`) và Socket.IO. Mỗi quy ước có **test kiểm bằng máy**: nếu API lệch quy
ước thì `test/api-conventions.e2e-spec.ts` (và `idor`, `limits`) đỏ. Lý do và các phương án đã loại:
[ADR-0028](adr/0028-api-conventions.md). Nguồn sự thật của kiểu dữ liệu là schema zod và type trong
`@ping/shared`, không phải tài liệu này.

## 1. Định dạng chung

- JSON UTF-8, tên trường **camelCase**. Không đưa chi tiết của ORM ra ngoài (ví dụ `_count` của
  Prisma): số đếm là trường phẳng `memberCount`, `channelCount`.
- **Ngày giờ**: chuỗi ISO 8601 UTC có hậu tố `Z` và mili giây (`2026-10-20T08:15:30.123Z`). Tên trường
  kết thúc bằng `At` (`createdAt`, `editedAt`, `joinedAt`); không có thì `null`.
- **ID**: UUID (UUIDv7, sắp xếp được theo thời gian tạo). Mọi tham số route tên `*Id` phải là UUID,
  sai → 400 trước khi chạm DB.
- **Số 64-bit** (bitmask `permissions`): chuỗi số thập phân, vì JSON không có bigint.
- `null` nghĩa là "không có giá trị"; trường tùy chọn của response mà không áp dụng thì bị bỏ hẳn.
- Mọi response có header `X-Request-Id`; client có thể gửi `X-Request-Id` (chỉ nhận UUID hợp lệ).

## 2. Lỗi

```json
{ "code": "VALIDATION_ERROR", "message": "Validation failed", "requestId": "…", "details": [ … ] }
```

- `code` **luôn** thuộc `ErrorCodes` (`packages/shared/src/errors.ts`). Client rẽ nhánh theo `code`,
  không bao giờ theo `message` (câu chữ tiếng Anh, có thể đổi) và không hiển thị `message` cho
  người dùng. `requestId` khớp header `X-Request-Id`; người dùng báo mã này để tra log.
- `details` chỉ có ở `VALIDATION_ERROR`: `[{ path, code, message }]` theo từng trường.
- Không bao giờ có stack hay chi tiết hạ tầng (host, port, câu SQL) trong response.

| HTTP | `code`                | Khi nào                                                                 |
| ---- | --------------------- | ----------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | body/query/tham số sai (zod), id không phải UUID, vượt trần số lượng    |
| 400  | `BAD_REQUEST`         | JSON hỏng, yêu cầu sai khác                                             |
| 401  | `UNAUTHORIZED`        | thiếu/hết hạn token, sai mật khẩu, refresh token không hợp lệ           |
| 403  | `FORBIDDEN`           | không phải thành viên, thiếu quyền, sai `Origin`/`X-Ping-Client` (CSRF) |
| 404  | `NOT_FOUND`           | tài nguyên không tồn tại, route không tồn tại                           |
| 409  | `CONFLICT`            | trùng (đã là thành viên, trùng email/username)                          |
| 413  | `BAD_REQUEST`         | body quá lớn (tối đa 32 KB)                                             |
| 429  | `TOO_MANY_REQUESTS`   | rate limit, khóa đăng nhập, flood; kèm header `Retry-After` (giây)      |
| 503  | `SERVICE_UNAVAILABLE` | Postgres không dùng được, hoặc Redis chết ở thao tác fail-closed        |
| 500  | `INTERNAL_ERROR`      | lỗi không lường trước                                                   |

**Khi nào thêm mã mới:** chỉ khi client cần rẽ nhánh khác nhau mà HTTP status + ngữ cảnh gọi không đủ
phân biệt. Hiện web phân biệt bằng ngữ cảnh (đăng nhập sai và phiên hết hạn đều là `UNAUTHORIZED`,
web chọn câu theo nơi gọi). Thêm mã = đổi hợp đồng: thêm vào `ErrorCodes`, vào `lib/error-message.ts`
của web và cả `en.json`/`vi.json`.

## 3. HTTP theo thao tác

| Thao tác                                              | Status | Body                                        |
| ----------------------------------------------------- | ------ | ------------------------------------------- |
| Tạo (POST tạo tài nguyên, kể cả `POST /servers/join`) | 201    | tài nguyên vừa tạo                          |
| Đăng nhập, refresh                                    | 200    | `{ user, accessToken }` / `{ accessToken }` |
| Đọc (GET), sửa (PATCH, PUT)                           | 200    | tài nguyên (hoặc danh sách/trang)           |
| **Xóa tài nguyên** (server, channel, role, tin nhắn)  | 200    | `{ "id": "…" }`                             |
| **Gỡ quan hệ** (rời server, kick, đăng xuất)          | 204    | không có body                               |

Retry an toàn: gửi tin nhắn dùng `nonce` (unique trong DB, retry trả lại đúng tin cũ, không phát lại
event); tạo server/channel/role nhận header `Idempotency-Key` (UUID, lưu 24 giờ trên Redis; request
trùng khi lần đầu còn đang chạy → 409).

Reaction (TG.2, [ADR-0064](adr/0064-message-reactions.md)): `PUT` và `DELETE
/messages/:messageId/reactions/:emoji` đều idempotent, trả **200** cùng
`{ messageId, reactions: [{ emoji, count, me }] }` để client đối soát trạng thái sau thao tác.
`GET` cùng URL trả `{ users, total, hasMore, nextCursor }`; cursor `after` là id hàng reaction,
không phải id user. Danh sách tin kèm `reactions`, cờ `me` luôn tính theo người gọi API.

Ghim (TG.3, [ADR-0066](adr/0066-message-pins.md)): `PUT`/`DELETE /messages/:messageId/pin` idempotent,
trả **200** cùng `{ messageId, channelId, pinnedAt, pinnedById }` (`pinnedAt: null` khi đã bỏ ghim);
`GET /channels/:channelId/pins` trả **mảng** `[{ message, pinnedAt, pinnedBy }]` mới ghim trước, tối
đa 50 phần tử — không phân trang. Mọi `MessageDto` có thêm `pinnedAt`/`pinnedById`.

## 4. 403 hay 404

- **Server**: không phải thành viên → **403**, kể cả server không tồn tại (không lộ server nào có thật).
- **Channel, tin nhắn, role**: id không tồn tại ở đâu cả → **404**; tồn tại nhưng không thuộc bạn →
  **403**. Cách này có tiết lộ "id này có thật", chấp nhận được vì UUIDv7 có 74 bit ngẫu nhiên, không
  dò được.
- Thành viên không thuộc server đang xét (`DELETE /servers/:id/members/:memberId`) → **404**.

## 5. Phân trang và trần số lượng

- **Cursor, không bao giờ offset.** Danh sách có thể lớn trả `{ <tênDanhSách>, hasMore }`, tham số
  `limit` (1–100, mặc định 50) và một cursor là **id** của phần tử cuối trang trước:
  - tin nhắn: `GET /channels/:id/messages?before=<id>` — mới → cũ;
  - thành viên: `GET /servers/:id/members?after=<id>` — cũ → mới; mỗi phần tử có `online` (ADR-0030).
- `limit` ngoài khoảng hoặc không phải số → 400 `VALIDATION_ERROR`. Tham số lạ (như `offset`) bị bỏ qua.
- Danh sách **bị chặn bằng trần** trả mảng thuần (channel, role, server của tôi, tin ghim của
  channel). Trần ở `@ping/shared` `Limits`: 200 channel/server, 100 role/server, 100 server/user,
  50 tin ghim/channel; vượt → 400 `VALIDATION_ERROR` với `details[0] = { path: "channels", code:
"too_big" }`. Trần channel và trần ghim là trần chính xác (đếm trong advisory lock); trần role và
  server là trần mềm (tạo đồng thời có thể vượt vài đơn vị). Ghim vượt trần trả mã riêng
  `PIN_LIMIT_REACHED` để web báo đúng lý do.

## 6. Giới hạn tần suất

Chi tiết ở ADR-0027. Tóm tắt: 100 request/phút/IP; đăng nhập 10/phút; khóa đăng nhập sau 5 lần sai
(cặp email + IP) hoặc 20 lần (email); 10 tin/10 giây/user/channel. Tất cả trả 429 + `Retry-After`.

## 7. Versioning

- Tiền tố `/api/v1`. Chỉ tăng version khi có thay đổi **phá vỡ** mà không thể làm theo expand/contract.
- Không phá vỡ (không tăng version): thêm endpoint, thêm trường vào response, thêm tham số tùy chọn,
  thêm giá trị mới vào enum mà client biết bỏ qua.
- Phá vỡ: xóa hoặc đổi tên trường, đổi kiểu hoặc nghĩa, đổi status code, đổi cursor.
- **Rolling deploy**: bản API mới phải phục vụ được bản web liền trước, bản web mới phải chịu được API
  cũ trong lúc deploy (CLAUDE.md quy tắc 13). Phá vỡ có chủ đích chỉ khi chưa client nào dùng (như
  đổi `GET /servers/:id/members` sang trang ở ADR-0028, lúc web chưa có giao diện thành viên).

## 8. Socket.IO

- Tên event `domain.action`. **Server → client** ở thì quá khứ (`message.created`, `message.updated`,
  `message.deleted`, `typing.started`, `presence.updated`, `permissions.changed`, `member.removed`);
  **client → server** là lệnh (`channel.join`, `channel.leave`, `typing.start`).
- Tên và kiểu payload nằm ở `@ping/shared/events`; payload là JSON thuần (không bigint, không Date).
- Thay đổi payload phá vỡ → event mới (`message.created.v2`), không thêm trường `version`.
- Event **không đảm bảo giao**: client phải bù bằng REST khi kết nối lại (đã có từ F5).
- `channel.join` có ack `{ ok: true } | { ok: false, code }` với `code` thuộc `ErrorCodes`.
- Giới hạn: gói ≤ 16 KB, 20 event/giây (bỏ qua) và 60 event/giây (ngắt) mỗi socket, 10 socket/user.

## 9. Thêm một endpoint mới

1. Schema zod trong `@ping/shared` (request) và type (response); validate bằng `ZodValidationPipe`.
2. `JwtAuthGuard` + `AbilityGuard` + `@CheckAbility` (hoặc kiểm tra tầng 2 trong service).
3. Một dòng trong bảng tấn công của `test/idor.e2e-spec.ts` nếu có id trong đường dẫn.
4. Lỗi dùng mã trong `ErrorCodes`; thao tác tạo mà client có thể retry thì idempotent.
5. Danh sách có thể lớn → cursor; còn lại có trần trong `Limits`.
6. Thêm mẫu vào `test/api-conventions.e2e-spec.ts` (mục dữ liệu) nếu là dạng response mới.

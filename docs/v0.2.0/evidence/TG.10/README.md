# Evidence TG.10 — Category kênh, lexorank, kéo thả + bàn phím, topic

- Ngày: 2026-10-31 (Asia/Saigon); nhánh `feat/tg10-categories`; base `55b6bbc` (main sau TG.11).
- Quyết định kiến trúc: [ADR-0072](../../../adr/0072-channel-categories-and-lexorank.md) accepted
  (OWNER duyệt trong phiên theo ủy quyền "giải quyết nốt giai đoạn hiện tại tới khi merge push
  vào main").

## Đã giao

**Shared** (`@ping/shared`):

- `lexorank.ts`: `firstRank()` ('m'), `after()`, `rankBetween()` — chèn giữa chỉ sinh chuỗi mới
  từ hai rank hàng xóm (không đánh số lại), `assignRanks` phía API dùng khi cạn khoảng.
- `ChannelCategoryDto`; `createCategorySchema`/`renameCategorySchema` (tên 1–32, trim)/
  `reorderCategoriesSchema` (`orderedIds` uuid[]); `moveChannelSchema`
  (`{categoryId: uuid|null, positionKey?}`, rank `^[a-z]{1,64}$`); `setTopicSchema`
  (≤200, chuỗi rỗng → null); `ServerDetail.categories`; `ChannelDto.topic/positionKey/categoryId`.
- Event `channel.reordered` — `ChannelReorderedPayload {serverId, scope: 'categories'|'category',
categoryId?, channelIds}` (scope 'categories' mang categoryId theo thứ tự mới, kể cả khi
  tạo/xóa category); `Limits.MAX_CATEGORIES_PER_SERVER = 50`; `AuditAction.CHANNEL_REORDER`.

**API**:

- Migration expand `20261029140000_tg10_channel_categories`: bảng `ChannelCategory {serverId,
name, position TEXT}` (FK server Cascade, index `(serverId, position)`); `Channel.categoryId`
  FK `onDelete: SetNull`, `Channel.topic`, `Channel.positionKey`. Vùng mặc định (`categoryId
NULL`) vẫn dùng `Channel.position` Int cũ — rolling-safe, không backfill (ADR-0072 mục 3).
- `POST/PATCH/DELETE /servers/:serverId/categories[/:categoryId]` + `PUT .../reorder` — guard
  `manage Channel` (MANAGE_CHANNELS), idempotency ở create, trần 50 kiểm trong transaction,
  reorder idempotent (đúng thứ tự hiện có → không ghi/không audit), sai tập id → 400, audit
  `CHANNEL_REORDER` khi thứ tự thật sự đổi.
- `PUT /channels/:channelId/move` — server nhận `positionKey` do UI tính (`rankBetween` sau khi
  bỏ chính kênh ra); bỏ trống = chèn cuối nhóm đích; advisory lock theo vùng
  (`hashtext(serverId)` cho vùng mặc định, `hashtext('cat:'+serverId)` cho category), cạn
  khoảng → gán lại đều cả nhóm; audit `CHANNEL_REORDER`.
- `PATCH /channels/:channelId/topic` — tái dùng event `channel.updated` (payload `ChannelDto`
  đã có `topic`), không audit (dữ liệu hiển thị nhẹ).
- `GET /servers/:serverId` trả kèm `categories` và sắp sẵn: vùng mặc định theo `position` Int,
  category theo lexorank, kênh trong category theo `positionKey` — client render không sort lại.
- Xóa category: kênh giữ nguyên (`categoryId/positionKey = NULL`) trong cùng transaction, trở
  lại đúng chỗ cũ ở vùng mặc định; event `channel.reordered` scope 'categories'.
- IDOR: `ID_ROUTES` 61 route (+6 category/move/topic), spec chéo server cho cả 4 route category
  và 2 route channel.

**Web**:

- `features/channels/sidebar-model.ts` — transform thuần (test Vitest): `groupChannels`,
  `planChannelMove`, `applyChannelMove`, `applyPositionUpdates`, `applyChannelOrder`,
  `applyCategoryOrder`, `reorderedCategoryIds`, `reorderCategoryTo`, `keyboardChannelMove`.
- Sidebar: header category `<button aria-expanded aria-controls>` thu gọn (lưu localStorage
  `ping.cat-collapsed.<userId>.<serverId>`, dữ liệu hỏng → rỗng, không lỗi), kéo thả HTML5
  thuần kèm vùng thả cuối nhóm, và **Alt+ArrowUp/Down** trên kênh/category (roving tabindex,
  focus theo dõi qua `onFocus` để phím tác động đúng mục đang focus) gọi cùng API move.
- Header kênh: topic hiển thị ngay dưới tên; nút bút (chỉ người có `manage Channel`) mở
  `ChannelTopicDialog` (`PingTextArea` ≤200) — toast lưu/xóa, lỗi FORBIDDEN → thông báo quyền.
- Cài đặt server: khối "Danh mục" (`category-manager`) — tạo, đổi tên, xóa (Popconfirm nói rõ
  kênh về vùng mặc định), sắp lên/xuống bằng `reorderedCategoryIds` → `PUT reorder`.
- Event realtime: `channel.reordered` vá cache theo thứ tự rồi refetch nền; `channel.updated`
  cập nhật topic cho tab khác.
- i18n vi/en đủ key (parity test của `messages.test.ts`).

## Kiểm chứng

| Hạng mục                   | Kết quả                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared unit                | **80/80** (lexorank: firstRank/after/rankBetween/assignRanks; schema category/move/topic; event/reorder payload)                                                                                                                                                                                                                                 |
| API unit                   | **302/302** (categories.service + ranks: trần 50, advisory lock, reorder idempotent/audit, move append/insert, xóa giữ kênh, topic normalize)                                                                                                                                                                                                    |
| Web unit                   | **271/271** (sidebar-model nhóm/sort/move/keyboard + collapsed-categories localStorage)                                                                                                                                                                                                                                                          |
| API e2e `categories`       | **10/10**: lexorank tăng, reorder idempotent + audit, move chèn/append, topic + event, 403 thành viên thường, IDOR chéo server, xóa giữ kênh, realtime 2 scope, validate                                                                                                                                                                         |
| IDOR                       | **61 route** (+6), 5/5 pass                                                                                                                                                                                                                                                                                                                      |
| API e2e toàn bộ            | **364/364** (43 file, 218 s); lần chạy đầu 363/364 do 1 flake 429 register ở `auth` — chạy lại sạch                                                                                                                                                                                                                                              |
| Migration                  | `20261029140000_tg10_channel_categories` apply sạch, `migrate status` in sync; `migrate diff --exit-code` no difference                                                                                                                                                                                                                          |
| Web e2e `categories`       | **pass ×2** (42,3 s / 39,2 s): tạo category, Alt+ArrowUp đưa kênh vào cuối category trên, thu gọn lưu qua reload, topic header + API, đổi tên/xóa category → kênh về vùng mặc định                                                                                                                                                               |
| Axe a11y                   | **4/4** (login/register, error states, app shell + menu + dialog, settings)                                                                                                                                                                                                                                                                      |
| Web e2e toàn bộ            | **50 pass + 1 skip + 5 fail** (28,9 phút). 3 flake tài nguyên giữa run (`attachment`, `sticker` ×2) — **pass ngay khi chạy riêng**; 2 spec cũ `auth-and-shell`/`profile` đỏ vì API dev-mode (không auto-verify) + có SMTP_URL — đã vá spec tự xác minh (mục Lưu ý), chạy lại `auth-and-shell`/`profile`/`account` trên API dev-mode **5/5 pass** |
| Build/bundle               | `pnpm build` 3/3 task; JS tải ban đầu **248,2 KB gzip** (≤ 450 KB), tải theo yêu cầu 775,7 KB                                                                                                                                                                                                                                                    |
| Lint/format/typecheck/docs | `format:check`, `docs:check`, lint (0 error), typecheck 4/4, unit 3/3 — sạch                                                                                                                                                                                                                                                                     |

## Lưu ý

- **Hồi quy TG.8 trên web e2e (vá kèm)**: `auth-and-shell` và `profile` đăng ký tài khoản mới
  rồi tạo server; chính sách `VERIFY_REQUIRED` bật ở mọi môi trường có `SMTP_URL` (web-e2e CI
  có Mailpit) nên tài khoản phải được xác minh trước. Thêm `ensureUserVerified()` dùng chung
  trong `global-setup` (token thật từ Mailpit → fallback `scripts/verify-user.ts`) và gọi ở hai
  spec; `account.spec` vẫn kiểm đúng nhánh bị chặn trước khi xác minh.
- **Hai trường thứ tự có chủ đích**: `position` Int chỉ còn nghĩa ở vùng mặc định; trong
  category dùng `positionKey`. Client PHẢI nhóm theo `categoryId` trước khi sort (ADR-0072).
- **E2E web học được**: điều hướng client trong `next dev` có lúc tồn tại hai cây `ChannelView`
  (kênh cũ + kênh mới) cùng một lúc — `getByTestId('channel-topic-edit')` khớp 2 phần tử và
  click rơi vào node sắp bị gỡ, modal mất state, không có PATCH nào được gửi. Cách ổn định:
  mở thẳng URL kênh (tải document mới) và chờ `toHaveCount(1)` trước khi click. Đây là hiện
  tượng chuyển trang tạm thời của dev, người dùng thật sau khi trang settle thao tác bình thường.
- Alt+Arrow phải bấm sau khi trang hydrate; spec bấm trong `expect.poll` (lặp tới khi API nhận)
  vì lần bấm đầu có thể rơi trước khi listener gắn.
- Web phần UI ban/unban của TG.11 vẫn gộp đợt web sau (như ghi ở evidence TG.11).

# ADR-0072: Category channel, thứ tự bằng lexorank và vùng mặc định giữ position Int

Status: accepted — OWNER duyệt trong phiên 2026-10-31 (ủy quyền "giải quyết nốt giai đoạn hiện
tại tới khi merge push vào main").
Date: 2026-10-31

## Context

TG.10 (docs/ping-v0.2.0-plan.md:507) cần: `ChannelCategory`; vị trí dạng lexorank **không đánh
số lại hàng loạt**; kéo thả **có phương án bàn phím**; thu gọn category lưu cục bộ; topic hiển
thị ở header; quyền quản lý channel; event `channel.reordered`; audit. Tiêu chí: sắp xếp đồng bộ
nhiều người dùng, thao tác đồng thời không phá thứ tự, a11y bàn phím, e2e.

Hiện trạng trước TG.10:

- `Channel.position` Int đơn điệu, xếp toàn bộ kênh của server; mọi thao tác chèn giữa phải
  `PATCH position` hàng loạt → hai người kéo thả cùng lúc ghi đè nhau.
- Chưa có nhóm kênh, chưa có topic; sidebar render danh sách phẳng từ `GET /servers/:id`.
- Realtime chỉ có `channel.created/updated/deleted`; thứ tự đổi không có tín hiệu cho tab khác.

## Decision

1. **Bảng `ChannelCategory {serverId, name, position TEXT}`, FK server Cascade.** Trần 50
   category/server kiểm ở service trong transaction (shared `Limits.MAX_CATEGORIES_PER_SERVER`,
   ADR-0028). Index `(serverId, position)` cho list/max; `position` là lexorank sinh bởi
   `packages/shared/src/lexorank.ts` (`firstRank` 'm', `after`, `rankBetween` — chèn giữa chỉ
   đụng MỘT hàng).
2. **`Channel.categoryId` FK `onDelete: SetNull`** (không Cascade): xóa category **giữ nguyên
   kênh**, kênh về vùng mặc định. API tự đặt `categoryId = NULL, positionKey = NULL` trong cùng
   transaction (SetNull chỉ là lưới an toàn ở DB), giữ `position` Int cũ nên kênh trở lại đúng
   chỗ cũ của vùng mặc định.
3. **Hai chế độ thứ tự có chủ đích**: kênh TRONG category sắp theo `positionKey` lexorank;
   vùng mặc định (channel `categoryId` NULL) vẫn sắp theo `position` Int cũ. Lý do: rolling-safe
   (client/API phiên bản trước vẫn đọc/ghi `position` đúng nghĩa) và không phải backfill rank cho
   dữ liệu đang chạy. `positionKey` NULL ngoài category; `position` vô nghĩa trong category —
   client PHẢI nhóm theo `categoryId` trước khi sort.
4. **Hợp đồng di chuyển**: `PUT /channels/:id/move {categoryId: uuid|null, positionKey?}`.
   `positionKey` do UI tính bằng `rankBetween(hàng xóm trên, dưới)` sau khi đã bỏ chính kênh ra;
   bỏ trống = server chèn CUỐI nhóm đích (server sinh rank). Server chỉ kiểm hình thức
   `^[a-z]{1,64}$` — UI là nguồn vị trí, server là nguồn dữ liệu.
5. **Chống tranh chấp bằng advisory lock trong transaction**: khóa `hashtext(serverId)` cho
   vùng mặc định (dùng chung với tạo channel, tránh hai request lấy cùng `max(position)`);
   khóa `hashtext('cat:' + serverId)` cho category/create/move-into-category (tránh hai move
   đọc cùng "kênh cuối" rồi sinh trùng rank). Rank cạn khoảng (`rankBetween` null) → gán lại
   ĐỀU cả nhóm đích bằng `assignRanks` (mỗi rank nằm trong bảng chữ cái, còn chỗ hai phía).
6. **`PUT /servers/:id/categories/reorder {orderedIds}` sắp lại TOÀN BỘ** category (idempotent:
   đúng thứ tự hiện có → không ghi gì, không audit thêm). Sai tập id (thiếu/thừa/trùng/không
   tồn tại) → 400. Gán rank nối tiếp; cạn khoảng → `assignRanks` cả danh sách.
7. **Event `channel.reordered` một shape, phân biệt `scope`**: `'category'` —
   `{categoryId (null = vùng mặc định), channelIds}` thứ tự kênh của MỘT nhóm; `'categories'` —
   `channelIds` mang các **categoryId** theo thứ tự mới (kể cả tạo/xóa category phát scope này).
   Client vá cache theo thứ tự event rồi refetch nền để lấy rank thật (event là thứ tự, không
   phải rank). Đổi tên category không phát event (trường hiển thị, tab khác refetch detail).
8. **Topic qua `PATCH /channels/:id/topic`, tái dùng event `channel.updated`**: payload đã là
   `ChannelDto` đầy đủ (có `topic`) nên không thêm hợp đồng mới. Chuỗi rỗng → `NULL`. Không
   audit: dữ liệu hiển thị nhẹ, hoàn tác bằng chính thao tác, ngoài nhóm nhạy cảm của quy tắc 11.
9. **Audit `CHANNEL_REORDER`** cho move channel + reorder category (sắp xếp lại CẤU TRÚC; cần
   đối chiếu khi tranh chấp). Tạo/đổi tên/xóa category không audit (xóa không phá dữ liệu nào,
   UI thấy ngay).
10. **Quyền `manage Channel` (MANAGE_CHANNELS) cho toàn bộ route category/move/topic** — category
    chỉ là cách nhóm kênh, cùng nhóm công việc với tạo/sửa/xóa kênh; actor không có quyền
    **không thấy** affordance kéo thả/bút sửa topic.
11. **Thu gọn category lưu localStorage `ping.cat-collapsed.<userId>.<serverId>`** — trạng thái
    hiển thị thiết bị (cùng nhóm recent sticker/settings đã áp dụng), không đồng bộ server; key
    tách theo user+server để hai tài khoản trên cùng máy không đè nhau. Dữ liệu hỏng/bị chặn →
    rỗng, không nổi lỗi.
12. **a11y**: header category là `<button aria-expanded aria-controls>`; danh sách dùng roving
    tabindex (`ArrowUp/Down` di focus); `Alt+ArrowUp/Down` di chuyển channel/category qua CÙNG
    API với kéo thả; focus được đặt lại sau khi node đổi nhóm. Kéo thả là HTML5 DnD thuần (không
    thêm dependency), kèm vùng thả cuối mỗi nhóm và đường chỉ đích.

## Alternatives

- **Float `position` chia đôi (a+b)/2**: hết chỗ sau ~50 lần chèn liên tiếp giữa hai mốc và
  sai số dấu phẩy động — phải rebalance thường xuyên; lexorank chuỗi minh bạch, so sánh theo
  ký tự ổn định giữa mọi collation — loại.
- **Đánh số lại toàn bộ (`position` 0..n) mỗi lần kéo**: mỗi thao tác ghi N hàng, hai người
  kéo thả đồng thời ghi đè nhau — đúng vấn đề TG.10 cần tránh — loại.
- **Chuyển vùng mặc định sang lexorank luôn (backfill)**: migration phải chạy dữ liệu trên
  postgres của mọi môi trường và client cũ mất nghĩa `position`; giữ Int cũ `condition` rolling
  deploy rẻ hơn, đổi sau là migration expand riêng — loại trong v0.2.
- **Xóa category Cascade xóa kênh**: mất dữ liệu người dùng ngoài ý muốn — loại; SetNull giữ
  kênh (mô tả trong UI nói rõ).
- **Một event riêng cho category (`category.created/…`)**: shape `channel.reordered` scope
  `'categories'` đã đủ cho cả tạo/xóa/reorder; thêm event là thêm bề mặt realtime không cần.
- **Đồng bộ trạng thái thu gọn qua server**: TG.12/TG.13 đã tách "thiết bị" vs "server"; thu gọn
  là hiển thị cục bộ, đồng bộ làm nặng API và lệch kỳ vọng đa thiết bị — loại.
- **Thư viện DnD (dnd-kit…)**: thêm dependency + bundle cho HTML5 DnD đủ dùng; đường bàn phím
  tự viết là bắt buộc anyway — loại.

## Consequences

- Chèn/kéo thả chỉ đụng một hàng (hoặc một nhóm khi rebalance hiếm); hai tab đồng bộ qua event
  - refetch nền; `GET /servers/:id` sắp sẵn (vùng mặc định trước, category theo lexorank, kênh
    trong category theo `positionKey`) để client render không cần sort lại.
- Hai trường `position`/`positionKey` cùng tồn tại là nợ kỹ thuật có chủ đích: tài liệu hoá
  trong DTO, comment service, và test e2e khẳng định vùng mặc định vẫn theo Int.
- Rebalance `assignRanks` là sự kiện hiếm nhưng ghi nhiều hàng trong một transaction; mọi
  client nhận event thứ tự rồi refetch để lấy rank mới — đúng một vòng.
- e2e: categories 10 test (lexorank tăng, reorder idempotent + audit, move chèn/append, topic
  - event, 403 thành viên thường, IDOR chéo server, xóa giữ kênh, realtime hai scope, validate);
    IDOR mở rộng 6 route; web e2e kiểm tạo/thu gọn/kéo-bàn phím/topic.
- Mở tương lai: chuyển vùng mặc định sang lexorank (migration expand + backfill), category lồng
  nhau/quyền theo category — ngoài phạm vi v0.2.

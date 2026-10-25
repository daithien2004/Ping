# ADR-0062: Permalink tin nhắn + cửa sổ `GET messages?around=`

Status: accepted — quyết định nằm trong kế hoạch Pha G (TG.5) được OWNER duyệt
Date: 2026-10-26

## Context

TG.5 cần mở được một liên kết tới **một tin bất kỳ** — kể cả tin rất cũ trong channel
10.000 tin — rồi tô sáng đúng tin đó, mà không tải cả lịch sử.

Trước TG.5 chỉ có deep-link `?m=<id>`: client tải trang mới nhất rồi cuộn tới `?m=` **nếu tin
đã nằm trong trang đã tải**; tin cũ hơn thì không mở được (phải cuộn lên tải dần từng trang).
Cách đó phụ thuộc độ dài lịch sử nên không dùng được cho permalink.

Ràng buộc: phân trang keyset theo `id` (ADR-0044), cache web là infinite query với **trang 0 =
mới nhất**, quyền đọc theo channel (ADR-0004) nên endpoint mới phải giữ kiểm tra IDOR, mọi chữ
trên UI qua i18n, không thêm state toàn cục, bundle ban đầu không tăng.

## Decision

**Permalink canonical là một route riêng, và API có thêm một chế độ đọc "cửa sổ quanh tin".**

1. **URL**: `/servers/:serverId/channels/:channelId/messages/:messageId`. Đổi server/channel
   trong URL → 404 của trang (không lộ tin của channel khác). `?m=` giữ nguyên làm **alias**
   cho liên kết đã phát hành; UI chỉ sinh URL mới (`messagePath()`).
2. **API**: `GET /channels/:channelId/messages?around=<id>&limit=N` — `around` **loại trừ lẫn
   nhau** với `before`/`after` (`400` "Provide at most one of before, after, around"),
   `limit` mặc định 50, trần 100 như các chế độ khác.
3. **`MessagesService.listAround`**: đọc tin đích trước (không tồn tại / khác `channelId` / đã
   xóa mềm → `404`), rồi **hai truy vấn keyset song song**:
   - cũ hơn hoặc bằng: `id <= around`, `orderBy id desc`, `take ceil(N/2) + 1`;
   - mới hơn: `id > around`, `orderBy id asc`, `take floor(N/2) + 1`.

   Trả `messages` theo đúng quy ước mới → cũ, `hasMore` (còn tin cũ hơn ngoài cửa sổ) và
   `hasNewer` (còn tin mới hơn). `+1` ở mỗi phía là để biết còn hay hết, kể cả `limit = 1`
   (`newerLimit = 0` vẫn lấy 1 dòng để kiểm).

4. **Cache web** giữ thêm metadata ngoài `InfiniteData`:
   `window: { aroundId, hasNewer }`. Trang 0 của cache **là** cửa sổ; tải tin cũ hơn dùng
   `fetchNextPage` sẵn có (cursor = tin cũ nhất của trang cuối), tải tin mới hơn bằng nút
   "Tải tin mới hơn" (`after=` từ tin mới nhất đang có, `prependNewer` chèn lên đầu).
5. **Mark-read bị chặn khi `hasNewer`**: người đọc mới thấy một cửa sổ giữa lịch sử, chưa thấy
   tin cuối nên không được đánh dấu đã đọc tới hiện tại.
6. **Rời permalink** (không còn tin đích) → `resetQueries` để cache về trang mới nhất.
7. **Reconnect / `channel.join`**: nếu cache đang là cửa sổ thì nạp lại **đúng cửa sổ** bằng
   một truy vấn `around=` (không kéo lịch sử); `refetchOnWindowFocus`/`refetchOnReconnect` tắt
   khi đang là cửa sổ để không ghi đè bằng trang mới nhất.
8. **Bất biến của cache**: `preserveLocalMessages` giữ `window` khi `fetchNextPage` dựng lại
   `{pages, pageParams}` từ đầu, và `useChannelSync` **bỏ qua** bước vá "nối tới hiện tại" nếu
   cache đã thành cửa sổ (race `channel.join` với lúc seed permalink).

Luồng mở permalink:

```text
browser  GET /servers/:s/channels/:c/messages/:m
   │
   ├─ render MessagePane(focusId = :m), cache mới nhất đang tải
   ├─ effect: focusId chưa có trong cache → useSeedAround
   │      GET /channels/:c/messages?around=:m&limit=50
   │      ← { messages: 50 (mới→cũ), hasMore, hasNewer }
   │      setQueryData → cache = { pages: [cửa sổ], window: { aroundId, hasNewer } }
   ├─ scrollToIndex(tin đích) + data-highlighted (3 s, không đổi URL)
   └─ hasNewer → nút "Tải tin mới hơn" (after= tin mới nhất đang có)
```

## Alternatives

- **Tải cả lịch sử rồi cuộn**: 10k tin = 200 trang 50 tin; chậm, tốn băng thông, hỏng mục tiêu
  "mở permalink tin cũ dưới 3 s".
- **Client gọi `before=` + `after=` quanh id rồi tự ghép**: hai request, client phải biết id tin
  đích nằm ở đâu, và phải tự tính `hasMore`/`hasNewer`; một endpoint giữ nguyên contract
  `MessagePage` cho cả ba chế độ nên ít sai lệch hơn.
- **Đưa `window` vào query key** (`['channels', id, 'messages', { around }]`): mỗi lần tải thêm
  tin mới lại đổi key → mất cache, nhấp nháy, và vẫn phải giữ metadata.
- **Giữ `?m=` làm canonical**: URL không có route riêng, không chia sẻ được cho người chưa mở
  app, và vẫn phải tải trang mới nhất trước khi biết tin đích ở đâu.
- **Tự động nối tới tin mới nhất sau khi mở permalink**: kéo cả 10k tin — đúng thứ TG.5 muốn
  tránh; thay bằng nút tải từng trang.
- **Đánh dấu đã đọc tới tin cuối khi mở permalink**: sai nghĩa "đã đọc" (người dùng mới thấy
  một cửa sổ giữa lịch sử).

## Consequences

- `MessagePage` thêm `hasNewer?: boolean` (tuỳ chọn) — client cũ không đổi hành vi; ba chế độ
  `before`/`after`/`around` dùng chung shape.
- Cache tin nhắn có thêm metadata ngoài `InfiniteData`; **mọi writer phải giữ `window`**. Đã
  ghim bằng unit test cho `preserveLocalMessages` (đúng hình dạng `infiniteQueryBehavior` trả
  về khi `fetchNextPage`) và bằng e2e (nút tải tin mới hơn còn sau khi tải tin cũ/`after=`).
- `?around=` là hai truy vấn keyset trên index `(channelId, id)` nên chi phí **O(limit)**, không
  phụ thuộc độ dài channel — đo trên channel 10k tin so với channel 200 tin (evidence TG.5).
- Mở permalink **không** tự theo tin mới; người dùng chủ động bấm "Tải tin mới hơn" (chủ ý).
- Ở permalink cũ, mark-read trễ tới khi người dùng rời permalink hoặc tải hết tin mới hơn —
  chấp nhận, vì "đã đọc tới cuối" sẽ sai.
- `?m=` chỉ còn là alias: không còn nút/luồng nào sinh ra nó; có thể bỏ sau khi hết liên kết cũ
  ngoài hệ thống (ghi ở `docs/known-issues.md`).
- Tô sáng dùng `data-highlighted` + hẹn giờ trong component (không phải fragment trên URL) nên
  reload vẫn tô sáng và không tạo thêm entry lịch sử.
- Xóa cứng tin đích không xảy ra qua API (chỉ xóa mềm) → permalink của tin đã xóa hiện
  "không tìm thấy tin nhắn" thay vì treo.

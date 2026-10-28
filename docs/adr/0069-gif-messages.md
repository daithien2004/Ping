# ADR-0069: Tin nhắn GIF (TG.25)

Status: accepted — kế hoạch TG.25 được OWNER duyệt trong phiên 2026-10-29 (bắt đầu triển khai
ngay trong phiên)
Date: 2026-10-29

## Context

TG.25 cần gửi GIF trong chat: picker tìm kiếm/trending, tin `kind=GIF` lưu URL + kích thước +
nhà cung cấp (KHÔNG tải tệp về), tab gần đây, tải lười, tôn trọng `prefers-reduced-motion`, ghi
công theo điều khoản nhà cung cấp. ADR-0059 chốt mọi thứ trả phí dời xuống cuối v0.2.0 nên cổng
GIF phải chạy trên free tier; nếu nhà cung cấp không dùng được thời điểm làm thì dùng bộ
GIF/WebP động tự host.

Ràng buộc hiện có:

- `Message.kind` là cột String ('text' | 'sticker') thêm từ TG.22 (schema.prisma:203), tin sticker
  đi kèm `stickerId` (schema.prisma:206) và service chặn sửa tin sticker
  (messages.service.ts:499-502) — GIF sẽ đi cùng nhánh này.
- Ảnh ngoài bị CSP chặn: `img-src` hiện chỉ `'self' blob: data:` + API origin (next.config.ts:24)
  — không thêm origin CDN của nhà cung cấp thì tin GIF không render được.
- Rate limit theo user đã có pattern riêng (MessageRateLimiter — 10 tin/10 giây mỗi user+channel,
  message-rate-limiter.ts:7-9) vì throttler toàn cục 100 req/phút/IP (app.module.ts:80) chạy
  trước JwtAuthGuard nên không biết userId.

## Decision

1. **Nhà cung cấp**: Tenor API (Google) làm provider chính, đứng sau cổng `GifProvider` trong
   API — client KHÔNG gọi nhà cung cấp trực tiếp. Key nằm trong env `TENOR_API_KEY` (OWNER tự
   tạo, khai optional theo pattern `GROQ_API_KEY` env.schema.ts:64-67; không commit, không log).
   Thiếu key hoặc Tenor lỗi/quota hết → `/gifs/*` trả 503 `GIF_PROVIDER_UNAVAILABLE` (mã mới
   trong `ErrorCodes`, errors.ts:5-33), picker hiện empty state, chat gửi/nhận bình thường.
   Nếu thời điểm làm Tenor không dùng được → adapter dự phòng trên cùng cổng: bộ GIF/WebP động
   tự host (catalog tĩnh seed như gói sticker hệ thống, CSP 'self' là đủ, có khung tĩnh sẵn).
   Rủi ro ghi rõ: free tier Tenor có hạn mức ngày — hết hạn mức là mất tìm GIF đến ngày sau,
   chấp nhận vì chat không phụ thuộc GIF.
2. **Lưu ngay trên Message, không bảng Gif**: tin GIF = `kind='gif'` + 4 cột nullable mới
   (`gifUrl, gifWidth, gifHeight, gifProvider`), `content` rỗng, không attachment — theo pattern
   TG.22 (kind + stickerId). GIF không phải entity của server: không trần, không quyền riêng,
   không lifecycle (xóa tin là hết) nên bảng riêng chỉ mua thêm join + bước resolve preview như
   sticker mà không đem lại gì; URL chốt tại thời điểm gửi là nguồn sự thật (Tenor đổi link thì
   tin cũ hiển thị khối lỗi — chấp nhận như sticker bị xóa). Client gửi `{ gifId, url, width,
height }`; API chỉ nhận URL https thuộc host allowlist của provider (mặc định
   `media.tenor.com`), sai → 400 `BAD_REQUEST` — chặn sớm, CSP chỉ là lớp sau. Migration expand
   an toàn, không index mới.
3. **An toàn**: `contentfilter=high` ghim cứng phía server (không nhận từ client); backend là
   cổng duy nhất giữ key; cache in-memory trong tiến trình, TTL 5 phút cho search/trending —
   kết quả công khai, không dữ liệu người dùng nên không có gì auth-sensitive cần tránh cache.
   Reaction không đụng tới: GIF chỉ là một kind của Message, không xử lý token như emoji.
4. **API + rate limit**: `GET /gifs/search?q=` và `GET /gifs/trending` (JWT bắt buộc; trả
   `GifDto { id, url, width, height, provider }` — grid dùng biến thể nhỏ, URL gửi đi là bản đủ
   lớn). Giới hạn **30 req/phút/user** bằng `GifRateLimiter` tái dùng `RedisThrottlerStorage` +
   fail-open (pattern MessageRateLimiter); limit toàn cục 100/phút/IP vẫn áp chồng.
5. **Web**: tab thứ 4 "GIF" trong sticker-picker hiện có (ba tab từ TG.22, sticker-picker.tsx:7)
   — dùng lại ô tìm kiếm, lưới điều hướng bàn phím, nút composer và hành vi bấm-là-gửi; picker
   riêng phải nhân bản cả khối đó mà không thêm giá trị. Lưới kiểu Giphy, tải lười
   IntersectionObserver; `prefers-reduced-motion` → không tự phát (tái dùng pattern
   `usePrefersReducedMotion`, sticker-message.tsx:11-24): tin GIF render khối giữ chỗ đúng
   kích thước, bấm mới phát; bộ tự host có khung tĩnh thì render khung tĩnh. Tab "Gần đây" của
   GIF lưu localStorage theo user (pattern recent sticker, 24 mục).
6. **Attribution**: dòng "GIFs by Tenor" (kèm link) cố định ở chân picker — theo yêu cầu ghi
   công của Tenor; bộ tự host không cần.
7. **CSP**: thêm đúng origin ảnh Tenor `https://media.tenor.com` vào `img-src` tại
   next.config.ts:24; không mở wildcard `*.tenor.com` — evidence cho thấy cần origin nào mới
   thêm origin đó. Bộ tự host chạy qua 'self' nên không đụng CSP.

## Alternatives

- Client gọi thẳng Tenor (key phía web): lộ key công khai, mất điểm chặn contentfilter và rate
  limit theo user — loại.
- Bảng `Gif` + FK như Sticker: GIF không phải tài sản quản trị (không upload, không xóa riêng,
  không trần) — join vô ích, loại.
- Lưu URL trong `content` dạng token như custom emoji: regex TG.4 phải học thêm node chỉ để
  nhúng ảnh ngoài và URL dài phình FTS (ADR-0068 đã để content cho token ngắn) — cột riêng sạch
  hơn, loại.
- Giphy: cùng kiểu hợp đồng nhưng Tenor đủ dùng cho chat và key Google Cloud tạo một bước;
  đổi provider sau chỉ là adapter mới trên `GifProvider`, loại khỏi v0.2.0.

## Consequences

- Migration expand: 4 cột nullable trên Message — tin cũ không đổi, rolling deploy an toàn;
  `MessageDto` thêm `gif` dựng thẳng từ cột (không cần truy vấn resolve URL như `stickerUrlsFor`).
- Tin GIF không sửa được (chặn cùng nhánh sticker ở messages.service.ts:499-502), xóa mềm bình
  thường; reply/mention/pin/reaction hoạt động như tin thường.
- CSP mở thêm đúng một origin ảnh ngoài; lớp API (allowlist host khi gửi) chặn trước nên chỉ
  origin này có thể được nhúng vào tin.
- Hết quota/key là mất tính năng tìm GIF (empty state) nhưng không lỗi chat; không thêm metric
  mới, chỉ log warn (quy tắc 21) — xem lại khi ADR-0059 mở giai đoạn chi phí.
- E2E: API (search/trending có key + cache; thiếu key → `GIF_PROVIDER_UNAVAILABLE`; gửi URL lạ
  → 400; tin kind='gif' qua list/event/retry/nonce trùng) + web (tab GIF, tải lười,
  reduced-motion, ghi công, gần đây).

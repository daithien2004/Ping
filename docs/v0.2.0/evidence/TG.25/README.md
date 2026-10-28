# Evidence TG.25 — Tin nhắn GIF

- Ngày: 2026-10-29 (Asia/Saigon); nhánh `feat/tg25-gifs`; base `b093d7a` (main sau TG.24).
- Thiết kế: [ADR-0069](../../../adr/0069-gif-messages.md) — OWNER duyệt trong phiên 2026-10-29.
- **Ủy quyền:** trong phiên 2026-10-29 OWNER ủy quyền tự duyệt kế hoạch và cho phép merge/push
  ("tự viết plan rồi tự duyệt đi coi như tôi duyệt... cho phép merge, push luôn") — mọi quyết
  định dưới đây theo quy trình vẫn ghi vết đầy đủ để đối chiếu.

## Đã giao

**Shared** (commit `7cc2c91`):

- `schemas/gif.ts`: `GIF_IMAGE_HOSTS = ['media.tenor.com']`, `gifPayloadSchema
{id ≤128, url ≤2048 ràng buộc **https** + host allowlist, width/height 1..4096}`,
  `GifDto`, `GifSearchResponse`, `MessageGifPreview {url,width,height,provider}`;
  `createMessageSchema` nhận `gif?` — nội dung bắt buộc rỗng, không attachment, không kèm
  sticker; `MessageDto`/`MessageCreatedPayload` thêm `kind:'gif'` + preview; mã
  `GIF_PROVIDER_UNAVAILABLE`. Unit shared **58/58** (+4, gồm ca bắt lỗi `http://` thường —
  refine đầu chỉ kiểm host, test bắt được và đã vá kiểm `protocol === 'https:'`).

**API** (commit sau review):

- Migration expand `20261028172513_tg25_gif_messages`: 4 cột nullable trên Message
  (`gifUrl/gifWidth/gifHeight/gifProvider`), không index; `migrate status` in sync.
- Module `gifs/`: `GifProvider` port + `TenorProvider` (Tenor API v2 `search`/`featured`,
  `contentfilter=high` + `media_filter=gif` ghim cứng server-side, biến thể `gif` làm URL,
  timeout 10 s, kết quả thiếu dữ liệu bị bỏ qua; không key → ném lỗi ngay không gọi mạng; key
  không bao giờ lọt vào message lỗi); cache in-memory TTL 5 phút ≤ 200 entry (lỗi không cache);
  `GifRateLimiter` 30 req/phút/user tái dùng pattern `MessageRateLimiter` (Redis, fail-open).
- `GET /gifs/search?q=` (1..64 ký tự) + `GET /gifs/trending` (limit 1..50, mặc định 24) —
  chỉ JwtAuthGuard, không ability mới; thiếu key/lỗi/quota → 503 `GIF_PROVIDER_UNAVAILABLE`.
- `TENOR_API_KEY` optional trong env.schema theo pattern `GROQ_API_KEY` (+ `.env.example`).
- Gửi tin: create() nhánh `input.gif` → `kind='gif'` + 4 cột chốt lúc gửi, `content=''`;
  schema đã chặn URL ngoài allowlist nên service không kiểm lại; nonce trùng trả tin cũ như
  sticker; update() chặn sửa tin GIF; outbox + realtime kèm preview; `toMessageDto` gói 4 cột
  thô thành preview (cột không lọt response); reply/read-state/pin/reaction hoạt động như tin
  thường (content rỗng nên tự nhiên ngoài FTS).

**Web** (commit sau review):

- CSP `img-src` thêm đúng `https://media.tenor.com` (next.config.ts), không wildcard.
- `features/gifs/`: api (zod parse GifSearchResponse) + hooks (`useGifSearch` debounce,
  `useGifTrending`), utils gần đây localStorage 24 mục theo user + test.
- Sticker-picker tab thứ 4 "GIF": lưới Giphy-style aspect-ratio từ width/height, tải lười
  IntersectionObserver, reduced-motion → khối giữ chỗ bấm-mới-phát, bấm GIF = gửi ngay
  `{nonce, gif}` không content, ghi công "GIFs by Tenor" ở chân tab, empty state 503 riêng,
  i18n vi/en.
- Render tin `kind='gif'`: `<img>` aspect-ratio theo width/height, lazy, khung lỗi
  "GIF không còn xem được" khi ảnh chết, reduced-motion như picker.

## Kiểm chứng

| Hạng mục                           | Kết quả                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                        | **58/58** (+4 GIF)                                                                                                                                                                                                                                                                                                        |
| API unit                           | **222/222** (29 file; thêm 13: provider map/timeout/no-key, cache TTL/evict, service cache-hit/unavailable/rate-limit)                                                                                                                                                                                                    |
| API e2e `gifs`                     | **9/9**: thiếu key → 503 cả hai endpoint; DI override fake provider + cache hit (2 gọi → provider 1 lần); gửi tin 201 + kind/preview + nonce trùng + list + outbox; host lạ 400; kèm content 400; sửa tin 400; rate limit 30 OK + lượt 31 → 429 (user khác không ảnh hưởng); reaction/reply/pin như tin thường            |
| Web unit                           | **217/217** (27 file; thêm 4: push recent trần/dedup, khóa theo user, parse lọc mục lạ, 503 chỉ trúng đúng mã)                                                                                                                                                                                                            |
| Web e2e `gif`                      | **2/2**: tab GIF trending qua route mock (ảnh buffer PNG qua media.tenor.com — đồng thời chứng minh CSP mở đúng origin vì CSP chặn trước route), ghi công, bấm → gửi API thật → tin kind='gif' render ảnh, vào "Gần đây"; search cập nhật theo q; 503 → empty state riêng, ẩn lưới + ẩn ghi công, chat vẫn gửi tin thường |
| Full API e2e                       | **307/307 (37 file, 165 s)** — trước TG.25: 298/298 (36 file)                                                                                                                                                                                                                                                             |
| Full web e2e                       | **44 pass + 1 skip (18,8 phút)**; 3 fail trong run (admin-surface, emoji-custom:204, pin) là ô nhiễm DB dev từ các run chết trong phiên — **cả 3 xanh khi chạy riêng** (5/5, 2,4 phút; tiền lệ TG.22), CI trên DB mới là phán quyết cuối                                                                                  |
| Production build (quy tắc 18)      | `E2E_PRODUCTION=1`: **security-headers + gif.spec 3/3 (48 s)** — CSP `img-src` mới (media.tenor.com) xác minh trên `next start`, không violation; GIF render được trên bản prod                                                                                                                                           |
| Lint/format/typecheck/build/bundle | lint 0 error (5 warning `no-img-element` cùng loại sticker/emoji sẵn có); prettier sạch; typecheck sạch cả repo; build prod api+web đạt; **bundle 246,9 KB ≤ 450 KB** (+0,5 KB so với TG.24)                                                                                                                              |
| Migration                          | `20261028172513_tg25_gif_messages` apply, in sync (gotcha: `prisma generate` phải chạy lại sau migrate — client ESM cache field cũ)                                                                                                                                                                                       |

## Vận hành

- **TENOR_API_KEY chưa có** khi triển khai: `/gifs/*` trả 503 đúng thiết kế, mọi nhánh khác
  của chat bình thường. Khi OWNER tạo key (Google Cloud, Tenor API free tier) chỉ cần set env
  và restart api — không migration, không cấu hình thêm.
- Free-tier quota Tenor có hạn mức ngày: hết hạn mức → 503 `GIF_PROVIDER_UNAVAILABLE` đến
  ngày sau — chấp nhận trong ADR-0069, chat không phụ thuộc GIF.

## Bài học vận hành của phiên (đắt giá, ghi lại cho các phiên sau)

- **Bug thật số 1 — worker đói hàng đợi (vá `8a89397`)**: nhánh mồ côi của worker khớp
  avatar/serverIcon 'ready' VĨNH VIỄN (chúng không bao giờ có `messageId`) — LIMIT 1 chốt ở
  hàng cũ nhất, claim lại mỗi tick, trừ `quotaBytes` vô hạn (row bắt được khi đã âm ~111 KB),
  đói toàn bộ upload mới. Đây chính là nợ "orphan rule nên có điều kiện boundAt" ghi từ
  TG.22; vá: mồ côi theo tuổi chỉ áp dụng `scope='message'`. Canari attachment.spec đỏ 3 lần
  liên tiếp → xanh 31,5 s sau vá. Kèm dọn vận hành: các hàng `queued/deleting` kẹt từ các run
  chết được kết thúc vòng đời (`status='deleted'`) theo đúng thủ tục đã ghi ở TG.24.
- **Web e2e không chạy shard song song trên máy dev**: `workers: 1` + specs dùng chung seed
  ("Ping Playground", #general) + rate limit login 10/phút/IP — 3 shard `--shard=N/3` đồng
  thời tự bắn nhau bằng 429 `pacedLogin` (một shard chết hàng loạt từ test thứ 5). Full suite
  PHẢI chạy một process (~10-20 phút).
- **Không build/không chạy suite khác song song với e2e đang chạy trên dev stack**:
  `next build` ghi đè `.next` của `next dev` đang phục vụ (spec sau đó ERR_CONNECTION_REFUSED),
  `pnpm --filter api build` (prisma generate + swap dist) làm pipeline upload treo "Đang kiểm
  tra tệp". Cả hai hiện tượng ban đầu tưởng bug TG.25 — thực tế là ô nhiễm môi trường do tự
  đụng cây làm việc giữa chừng run. Trình tự đúng: e2e xong → build → kiểm prod → merge.

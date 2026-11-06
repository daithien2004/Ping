# Cách Discord triển khai và kế hoạch sửa Ping

2026-11-06 · tài liệu tham khảo, không phải ADR. Số đo lấy trên bản dev local; nguồn và mức chắc chắn ở cuối tài liệu.

## Tóm tắt

Lag và lỗi 429 của Ping đến từ việc web bắn 69 request `/unread` mỗi lần tải trang (mỗi server một request); Discord tránh điều này bằng cách lấy read state một lần và so sánh ID, không đếm lại.

1. **Nguyên nhân đã đo:** 69 request unread trong 83 ms, 38 request trả 429, `/permissions` mất 8 giây vì bị xếp hàng sau các request đó.
2. **Unread:** Discord lưu con trỏ đã đọc theo channel, so sánh ID ở client và giữ bộ đếm mention sẵn; Ping đếm lại bằng SQL cho từng server.
3. **Rate limit:** Discord chia bucket theo route và tài nguyên, trả header và bắt client chờ `Retry-After`; Ping từng dùng 100/phút/IP cho mỗi route với khóa 60 giây và client không xử lý 429. Từ [ADR-0080](adr/0080-rate-limit-theo-bucket-va-nguoi-dung.md), Ping chia bucket theo nhóm route, khoá theo người dùng sau xác thực (IP cho route chưa xác thực), khóa 2–10 giây; client đã chờ đúng `Retry-After` từ [ADR-0078](adr/0078-hang-doi-request-va-retry-after.md).
4. **Ảnh đính kèm:** Ping phục vụ byte ảnh qua chính API với link sống 60 giây, làm mới mỗi 45 giây cho từng file; Discord dùng CDN riêng và link sống 24 giờ. Từ ADR-0079, Ping bỏ làm mới định kỳ và nâng hạn link lên 24 giờ.
5. **Đã đúng, không cần sửa:** ID sắp theo thời gian, index và cursor cho tin nhắn và thành viên, gộp presence, giới hạn typing, mô hình quyền tập trung, nonce và giới hạn gửi tin, thông báo hai tầng, tìm kiếm Postgres đúng quy mô, giới hạn sự kiện socket.

Làm trước việc 1 đến 3 trong mục Lộ trình; chúng khắc phục phần lớn 429 và lag.

**Phạm vi tài liệu:** chỉ giữ những phần Discord làm mà Ping nên học. Đã bỏ các phần không áp dụng cho một app chat nhóm nhỏ: lưu trữ Cassandra/ScyllaDB và chia bucket theo thời gian, fanout Elixir cho guild 30.000 người, Elasticsearch chia cell, voice và sharding gateway. Các phần này chỉ xuất hiện khi cần giải thích vì sao Ping không phải làm theo. Xác thực phiên đăng nhập chưa được tra cứu vì Ping đã có thiết kế riêng (ADR-0027).

## Hiện trạng Ping qua số đo

Một lần tải trang với tài khoản 69 server bắn 69 request `/unread` trong 83 ms; 38 request bị 429 và các request cần thiết khác bị đẩy chậm tới 8 giây.

| Chỉ số                        | Kết quả                                   |
| ----------------------------- | ----------------------------------------- |
| Số server của tài khoản       | 69                                        |
| Request `/servers/:id/unread` | 69, mỗi server một request                |
| Kết quả của 69 request đó     | 31 trả 200, 38 trả 429                    |
| Thời gian mỗi request unread  | trung bình 5,6 giây, chậm nhất 8,1 giây   |
| `/servers/:id/me/permissions` | 8,0 giây (các request khác 0,35–0,6 giây) |
| Tổng request API của cả trang | 92, trong đó 69 là unread                 |

Đo bằng Performance API trong Chrome trên bản dev `localhost:3000` ngày 2026-11-06, một lần F5, bản dev nên số tuyệt đối có thể khác production.

Ba nguyên nhân khớp với số đo:

- `ServerRailItem` (`server-rail.tsx`) gọi `useUnread(serverId)` trong vòng `servers.map`, nên N server là N query với N `queryKey` khác nhau.
- Giới hạn chung 100 request/phút/IP kèm `blockDuration: 60_000` (`app.module.ts:87`): vượt trần là cả API bị khóa một phút.
- Trình duyệt chỉ chạy khoảng 6 kết nối song song tới một origin, nên 69 request unread chiếm hết chỗ và các request cần để vẽ màn hình phải xếp hàng. Đây là lý do `/permissions` mất 8 giây.

SQL của endpoint (`read-state.service.ts:101`) còn chạy hai `count(*)` tương quan cho mỗi channel và `COUNT_CAP` chỉ cắt kết quả sau khi đã đếm xong; phần này là suy luận từ code, chưa đo bằng `EXPLAIN ANALYZE`.

Chưa kiểm chứng: throttler có đếm cả request `OPTIONS` (preflight cross-origin) hay không. `enableCors` ở `app.setup.ts:27` không đặt `maxAge`, nên nếu có đếm thì mỗi request tốn gấp đôi hạn mức.

## Unread và read state

Discord không đếm tin chưa đọc mỗi lần hỏi: nó lưu sẵn con trỏ đã đọc cho từng channel và chỉ so sánh ID; Ping nên đổi từ “đếm” sang “so sánh” và gộp dữ liệu của mọi server vào một lần tải.

**Discord làm gì** ([Read State, tài liệu cộng đồng](https://discord-userdoccers.pages.dev/topics/read-state)):

- Mỗi người dùng có một read state cho mỗi channel, lưu ID tin đã đọc gần nhất. Channel chưa đọc khi `last_message_id` của channel mới hơn `last_message_id` trong read state, vì ID tăng dần theo thời gian.
- `mention_count` là bộ đếm lưu sẵn: tăng khi có tin ping bạn, về 0 khi bạn đọc hoặc nhắn.
- Đánh dấu đã đọc bằng `POST /channels/{id}/messages/{id}/ack`, và có `POST /read-states/ack-bulk` để gửi nhiều read state trong một request.
- Client tự cập nhật trạng thái cục bộ theo sự kiện ack và tự dọn read state cũ (channel đã xóa, server đã rời) lúc khởi động.
- Phía server, read state là một service riêng: mỗi người một bản ghi cho mỗi channel nên có hàng tỷ bản ghi, giữ trong cache LRU trên RAM, ghi xuống Cassandra trễ khoảng 30 giây ([Discord Blog](https://discord.com/blog/why-discord-is-switching-from-go-to-rust)).

Tài liệu mình đọc không nói dữ liệu này đến client bằng cách nào lúc kết nối. Theo hiểu biết chung của mình (chưa kiểm chứng ở nguồn nào), nó được đẩy một lần qua Gateway trong sự kiện `READY`.

**Ping hiện tại so với Discord:**

| Khía cạnh              | Discord                            | Ping hiện tại                                                       |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Lấy dữ liệu lúc mở app | một lần cho mọi server             | 69 request, mỗi server một request                                  |
| Channel chưa đọc       | so sánh hai ID                     | SQL `count(*)` theo từng channel                                    |
| Số mention             | bộ đếm lưu sẵn                     | đếm lại từ bảng mention mỗi lần                                     |
| Cập nhật tiếp          | sự kiện realtime                   | có sẵn (`useUnreadEvents`) nhưng vẫn refetch khi focus và reconnect |
| Ghi đã đọc             | ack từng channel, có ack hàng loạt | `POST /channels/:id/read` từng channel                              |

**Đề xuất cho Ping**, từ dễ đến khó:

1. Gộp một request cho mọi server, ví dụ `GET /users/me/unread`, rồi `setQueryData` từng `qk.unread(serverId)` để các component đang đọc cache không phải sửa. N request thành 1.
2. Đổi “đếm” thành “so sánh”: mỗi channel chỉ cần `lastMessageId`; chưa đọc = `lastMessageId > lastReadMessageId`. UUIDv7 của Ping sắp xếp được theo thời gian nên làm được, rẻ hơn nhiều so với `count(*)`. Chỉ mention cần số chính xác; unread có thể chỉ là chấm.
3. Thêm ack hàng loạt để đánh dấu đã đọc nhiều channel cùng lúc (“ đánh dấu tất cả đã đọc”).
4. Lưu bộ đếm mention thay vì tính lại, nếu sau này cần mở rộng (bước lớn, có thể cần ADR theo quy tắc 15 trong CLAUDE.md).

Lưu ý ràng buộc: `notifications/badge.ts` cộng unread của mọi server từ cache để hiện số trên title tab và favicon, nên hướng “chỉ tải server đang xem” sẽ làm badge sai.

## Rate limit và 429

Discord chia giới hạn theo từng route và từng tài nguyên, trả header để client tự điều tiết, và chờ đúng `Retry-After` thay vì khóa cả API; Ping trước đây dùng 100/phút/IP cho mỗi route và khóa một phút khi vượt. [ADR-0080](adr/0080-rate-limit-theo-bucket-va-nguoi-dung.md) đã thay bằng bucket theo nhóm route, khoá theo người dùng sau xác thực và khóa 2–10 giây; mục này giữ lại để đối chiếu với cách Discord làm.

**Discord làm gì** ([Rate Limits, tài liệu Discord](https://docs.discord.com/developers/topics/rate-limits)):

- Giới hạn áp theo từng endpoint và phương thức HTTP, khóa theo tài nguyên cấp cao (channel, guild, webhook) trong đường dẫn: cùng một endpoint trên hai channel khác nhau có hạn mức riêng. Một số endpoint dùng chung bucket, nhận biết qua header `X-RateLimit-Bucket`.
- Mỗi phản hồi mang `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `-Reset-After`; riêng 429 có thêm `Retry-After` và thân JSON `{message, retry_after, global}`.
- Có giới hạn toàn cục riêng (50 request/giây cho bot), tách khỏi giới hạn từng route.
- Client được yêu cầu đọc header, không gửi vào bucket đã cạn trước khi nó reset, và chờ đúng thời gian khi gặp 429. Discord nói rõ không nên hard-code giới hạn.
- Riêng IP gửi quá nhiều request lỗi (401, 403, 429) sẽ bị chặn tạm: ngưỡng 10.000 request lỗi trong 10 phút.

**Ping hiện tại so với Discord:**

| Khía cạnh         | Discord                            | Ping hiện tại                                                                                                         |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Đơn vị đếm        | theo route và tài nguyên           | theo route và nhóm route; khoá theo `user:<sub>` sau xác thực, IP cho route chưa xác thực (`http-throttler.guard.ts`) |
| Khi vượt          | chờ `retry_after`, thường vài giây | khoá 2–10 giây theo bucket (login/register 60 giây)                                                                   |
| Header cho client | đầy đủ                             | đầy đủ, không hậu tố: `X-RateLimit-*` + `Retry-After` (ADR-0078)                                                      |
| Client xử lý 429  | đọc header, chờ, không gửi thêm    | hàng đợi trong `api-client` đọc header và chờ đúng `Retry-After` (ADR-0078)                                           |
| Ai bị đếm         | theo token (người dùng/bot)        | theo access token sau khi verify; IP khi chưa đăng nhập hoặc token sai (ADR-0080)                                     |

**Đề xuất cho Ping**, theo thứ tự ưu tiên:

1. **Client có hàng đợi yêu cầu và tôn trọng `Retry-After`** trong `api-client`: giới hạn số request đang bay, khi gặp 429 thì tạm dừng cả hàng đợi đến hết thời gian chờ rồi mới gửi tiếp. Đây là phần Discord yêu cầu ở phía client và Ping chưa có.
2. **Giảm `blockDuration`** từ 60 giây xuống vài giây; với cửa sổ cố định 60 giây thì khóa dài biến một đợt burst thành cả phút ngưng trệ.
3. **Đếm theo người dùng đã đăng nhập thay vì IP** (giữ IP cho route chưa xác thực như `/auth/*`), và đặt `TRUST_PROXY` đúng nếu API chạy sau proxy.
4. **Tách bucket theo nhóm route**: đọc nhẹ (unread, permissions, attachment link) hạn mức cao hơn, ghi (gửi tin, upload) riêng, `/auth/*` giữ nghiêm như hiện tại (5 và 10 request/phút).
5. Gửi `X-RateLimit-Limit` và `-Remaining` để client có thể tự giãn tốc độ trước khi chạm trần.

Bước 1 và 2 chỉ là giảm đau: nếu vẫn bắn 69 request mỗi lần tải trang thì vẫn chạm trần, nên phải làm cùng mục Unread ở trên.

## Kết nối realtime và reconnect

Khi mất kết nối, Discord cho client nối lại đúng phiên cũ và server gửi bù các sự kiện đã lỡ; Ping thì tải lại unread của mọi server mỗi lần socket nối lại, nên một lần rớt mạng tạo lại đợt 69 request.

**Discord làm gì** ([Gateway Events, tài liệu Discord](https://docs.discord.com/developers/topics/gateway-events)):

- Khi kết nối, gateway gửi `Hello` kèm `heartbeat_interval`, client phải gửi `Heartbeat` đúng chu kỳ đó, kèm số thứ tự sự kiện cuối cùng đã nhận.
- `Ready` trả `session_id` và `resume_gateway_url`. Các guild ban đầu chỉ ở dạng “unavailable” rồi được nạp dần qua các sự kiện `Guild Create`; client không phải chờ tải xong tất cả mới dùng được.
- Khi rớt mạng, client gửi `Resume` với `token`, `session_id` và `seq` (số thứ tự sự kiện cuối đã nhận). Gateway phát lại các sự kiện bị lỡ rồi trả `Resumed`. Nhờ vậy client không phải tải lại toàn bộ trạng thái.

**Ping hiện tại:** `unread/hooks.ts:94-99` trên sự kiện `connect` gọi `invalidateQueries` cho mọi query unread, vì tin đến lúc mất kết nối không có sự kiện bù. Với 69 server đó là 69 request mỗi lần nối lại. Nếu mạng chập chờ hoặc API khởi động lại, đợt request này lặp lại và dễ chạm trần 429 (đợt đó còn đẩy cả những người dùng khác nối lại cùng lúc sau khi API restart).

**Đề xuất cho Ping:**

1. Sửa trước: khi `connect`, chỉ gọi một request gộp (xem mục Unread) thay vì invalidate từng server.
2. Cân nhắc gắn số thứ tự sự kiện cho mỗi kết nối và cho phép client gửi số thứ tự cuối khi nối lại, server giữ bộ đệm ngắn các sự kiện gần đây để phát bù; quá xa thì báo client tải lại. Đây là thay đổi hợp đồng sự kiện, cần ADR (quy tắc 15) và đọc skill `realtime-event-contract` của dự án trước khi làm.
3. Kiểm tra xem phiên bản Socket.IO đang cài có hỗ trợ sẵn khô phục trạng thái kết nối hay không trước khi tự viết cơ chế riêng (theo hiểu biết của mình, tính năng này có điều kiện với adapter Redis; chưa kiểm chứng với bản đang dùng, hãy đọc docs đúng version theo CLAUDE.md).
4. Dùng bài kiểm thử reconnect storm có sẵn (skill `load-test-report`) để đo trước và sau khi sửa.

## Tải dữ liệu lười và server lớn

Ping đã làm đúng phần tải lười theo server đang xem; điểm lệch duy nhất là unread, và tài khoản 69 server là một hình dạng tải bất thường so với mức Discord nêu.

**Discord làm gì:**

- Khi kết nối, các guild đến dưới dạng “unavailable” rồi được nạp dần qua sự kiện `Guild Create`. Với guild lớn (vượt `large_threshold`) chỉ gửi một phần thành viên (đang online, có role, đang trong voice); muốn thêm thì client gửi `Request Guild Members`, nhận về từng khối tối đa 1000 thành viên, truy vấn theo tiền tố tối đa 100, và lệnh này có rate limit riêng ([Gateway Events](https://docs.discord.com/developers/topics/gateway-events)). Đây là tài liệu dành cho bot; client thường có cơ chế riêng mà tài liệu này không nói.
- Phía server mỗi người dùng có một session process và mỗi guild có một guild process; sự kiện trong guild được phát tới mọi session. Thư viện Manifold gộp các đích theo node để mỗi node chỉ nhận một lần gửi, giảm CPU và lưu lượng mạng.
- Guild lớn là nơi vỡ: khoảng 30.000 người cùng online, mỗi lần gửi mất 30–70 µs nên một lần phát tốn 0,9–2,1 giây, guild process bị ùn hàng đợi và Discord phải tự tay tắt bớt tính năng sinh sự kiện ([Scaling Elixir to 5 million users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)). Trung bình mỗi người dùng thuộc khoảng 5 guild.

**Ping hiện tại** (đọc từ code và quan sát request):

- Khi mở `localhost:3000`, chỉ server đang xem tải `channels`, `members`, `emojis`, `me/permissions` (mỗi loại một request), đúng hướng tải lười. Danh sách thành viên đã phân trang bằng cursor.
- Socket vào room `server:<id>` của mọi server ngay lúc kết nối (`realtime.gateway.ts:126-137`) để nhận sự kiện cho huy hiệu unread. Cách này giống việc Discord đăng ký mọi guild, và hợp lý cho quy mô nhóm nhỏ.
- Presence đã được gộp theo khoảng `PRESENCE_BATCH_MS` (mặc định 1 giây) trước khi phát, đúng tinh thần gộp của Manifold.
- Duy nhất unread là dữ liệu theo từng server mà lại tải cho mọi server (69 request).
- `/servers/:id/members` mất 882 ms trong khi các request cùng loại mất 0,35–0,6 giây. Mỗi trang gọi `onlineUserIds` (`realtime.service.ts:79`) và `fetchSockets` qua adapter Redis là một lượt hỏi cả cluster. Chưa đo riêng, đáng ghi nhận để đo sau.

**Đề xuất cho Ping:**

1. Giữ nguyên hướng tải lười; chỉ sửa unread như mục trên.
2. Đừng tối ưu cho server cỡ 30.000 người, đó không phải bài toán của Ping. Dùng tài khoản 69 server như bài test cực đoan và thêm một tài khoản 5–10 server làm bài test thường, vì Discord nêu trung bình khoảng 5 guild mỗi người. Bài k6 sẵn có (skill `load-test-report`) có thể định nghĩa hai hồ sơ này.
3. Đo riêng `/members` bằng `EXPLAIN ANALYZE` và thời gian `fetchSockets` trước khi kết luận nó là nút thắt.

## Lưu trữ tin nhắn, ID và phân trang

Ping đã theo đúng nguyên tắc khóa của Discord (ID sắp theo thời gian, index theo channel, phân trang bằng cursor), nên mục này không cần sửa; bài học còn lại là gộp các lần đọc trùng nhau.

**Discord làm gì** ([How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages?s=09)):

- Tin nhắn chia phân vùng theo `channel_id` cộng một “bucket” là một cửa sổ thời gian cố định, mọi tin của một channel trong một bucket nằm cùng chỗ. Mọi ID là Snowflake nên sắp xếp được theo thời gian.
- Năm 2017: 12 node Cassandra. Đầu 2022: 177 node và hàng nghìn tỷ tin. Vấn đề là “hot partition”: nhiều lượt đọc đồng thời vào cùng một channel làm chậm cả node, cộng gián đoạn do garbage collection.
- Chuyển sang ScyllaDB (tháng 5/2022) còn 72 node, p99 đọc lịch sử từ 40–125 ms xuống 15 ms, p99 ghi từ 5–70 ms xuống 5 ms.
- Giữa API và DB là các “data service” viết bằng Rust, không có logic nghiệp vụ. Hai kỹ thuật đáng chú ý: **request coalescing** (nhiều request đọc cùng một hàng chỉ sinh một truy vấn DB, kết quả chia cho tất cả bên đang chờ) và **định tuyến bằng consistent hash theo channel ID** để mọi request của một channel vào cùng một instance, nhờ đó gộp được nhiều hơn.

**Ping hiện tại** (đọc từ code, `schema.prisma`, `messages.service.ts`):

| Khía cạnh           | Discord                       | Ping                                                                      |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| ID                  | Snowflake, sắp theo thời gian | UUIDv7 (`@default(uuid(7))`), sắp theo thời gian                          |
| Index đọc lịch sử   | partition (channel, bucket)   | `@@index([channelId, id(sort: Desc)])`                                    |
| Phân trang          | theo ID                       | cursor theo ID, lấy dư một hàng để biết còn trang sau (`take: limit + 1`) |
| Idempotency khi gửi | nonce                         | `@@unique([channelId, authorId, nonce])`                                  |
| Gộp đọc trùng       | request coalescing            | chưa có                                                                   |

Danh sách thành viên (`servers.service.ts:292`) cũng đã phân trang bằng cursor, đúng hướng.

**Đề xuất cho Ping:**

1. **Không đổi phần lưu trữ.** Postgres với index trên là đủ cho quy mô nhóm nhỏ; chia bucket theo thời gian là giải pháp cho quy mô hàng nghìn tỷ tin và không phải nút thắt của Ping.
2. Nếu đo thấy nhiều người cùng mở một channel nóng gây tải lặp lại, cân nhắc **gộp request đọc trùng trong tiến trình** (một `Map` các promise đang chạy theo khóa, xoá khi xong) cho vài truy vấn nóng như permissions và unread. Lưu ý quy tắc 1 của CLAUDE.md cấm state dùng chung trong RAM, nhưng promise đang bay trong một request là bộ nhớ tạm của tiến trình, không phải state chia sẻ giữa các bản sao; hãy ghi rõ lý do trong ADR.

## Attachments và CDN

Ping phục vụ file ảnh qua chính API với link ký sống 60 giây, nên mỗi ảnh tốn hạn mức rate limit nhiều lần; Discord tách CDN khỏi API và dùng link ký sống 24 giờ. [ADR-0079](adr/0079-tai-tep-dinh-kem-luoi.md) đã nâng hạn link lên 24 giờ và bỏ làm mới định kỳ; byte ảnh vẫn đi qua API nên hạn mức chung vẫn là điểm khác biệt còn lại.

**Discord làm gì** ([BleepingComputer, 2023](https://www.bleepingcomputer.com/news/security/discord-will-switch-to-temporary-file-links-to-block-malware-delivery)):

- Link tệp đính kèm trên CDN có ba tham số chữ ký `ex` (hết hạn), `is` và `hm` (chữ ký). Link hợp lệ cho đến thời điểm `ex`, và bài báo nêu thời hạn 24 giờ.
- Khi client lấy dữ liệu có chứa link (ví dụ tin nhắn), API tự trả link còn hạn; link hết hạn thì xin link mới.
- File tải từ CDN riêng nên không đụng vào giới hạn của API (suy ra từ việc Discord dùng tên miền CDN riêng; nguồn trên không nói rõ điều này).

**Ping hiện tại** (đọc từ code, sau ADR-0079):

| Khía cạnh                    | Discord                     | Ping                                                                                           |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| Nơi phục vụ byte file        | CDN riêng                   | chính API: `GET /api/v1/attachments/:id/file?...&signature=...` (`attachments.service.ts:358`) |
| Thời hạn link                | 24 giờ                      | 24 giờ (`AttachmentLimits.URL_SECONDS`, nâng từ 60 giây — ADR-0079)                            |
| Link đi kèm dữ liệu tin nhắn | có, API tự trả link còn hạn | không: client phải gọi `GET /attachments/:id/download` cho từng file                           |
| Làm mới link                 | khi hết hạn                 | không làm mới định kỳ; ảnh lỗi tải thì refetch đúng một lần (ADR-0079)                         |

Hệ quả trước ADR-0079: mỗi ảnh trên màn hình là hai request lấy link (`attachment-list.tsx` gọi `useAttachmentLink` hai lần, một cho file, một cho thumbnail), lặp lại mỗi 45 giây, cộng với request tải byte ảnh mỗi khi URL đổi. `grep` chỉ thấy route health được `@SkipThrottle()`, nên theo code thì cả route `/file` cũng bị đếm vào 100 request/phút. Với 30 ảnh trên màn hình, ước tính thô: 30 × 2 request lấy link mỗi 45 giây ≈ 80 request/phút, chưa tính tải byte ảnh. Đây là ước tính từ code, chưa đo trên một kênh thật.

**Đề xuất cho Ping**, từ nhẹ đến nặng:

1. Chỉ lấy thumbnail cho ảnh, và chỉ lấy link đầy đủ khi người dùng bấm xem hoặc tải. Chỉ lấy khi ảnh vào vùng nhìn (IntersectionObserver), không lấy cho ảnh đã cuộn qua.
2. Bỏ `refetchInterval` và làm mới link khi tải ảnh thất bại (403) hoặc khi sắp hết hạn, như Discord “xin link mới khi hết hạn”.
3. Trả sẵn link ký cùng dữ liệu tin nhắn (mỗi `attachment` trong response của `/channels/:id/messages` có `url` và `expiresAt`) để không cần gọi `/download` từng file. Đây là đổi hợp đồng response, cần xem `docs/api-conventions.md` và quy tắc 19.
4. Nâng thời hạn link (ví dụ vài phút đến vài giờ) để ít phải làm mới; cân nhắc với rủi ro link bị chia sẻ, vì link hiện gắn với `userId` nên rủi ro thấp.
5. Miễn trừ route `/file` khỏi bộ đếm chung hoặc cho bucket riêng hạn mức cao, hoặc về lâu dài tách phục vụ file sang CDN/object storage (nếu đổi thì cần ADR).

## Presence, typing và tín hiệu tần suất cao

Ping đã xử lý đúng cả hai tín hiệu này (gộp presence, giới hạn tần suất typing ở cả client và server), nên đây là mục ưu tiên thấp.

**Discord làm gì:** khi một người online, guild process phát presence của họ tới các session đang kết nối ([Scaling Elixir](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)); vì việc phát tốn thời gian tỉ lệ với số người, Discord gộp đích theo node. Về typing, nguồn mình đọc được chỉ là một thảo luận của người dùng discord.py ([thảo luận #5969](https://github.com/Rapptz/discord.py/discussions/5969)): chỉ báo đang gõ hiện khoảng 10 giây và client phải gửi lại đều đặn để duy trì. Đây là nguồn yếu, đừng xem là thông số chính thức.

**Ping hiện tại** (đọc từ code):

| Tín hiệu            | Cơ chế hiện có                                                                                      | Vị trí                              |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Typing, phía client | gửi tối đa 3 giây một lần, dùng `socket.volatile.emit` (mất gói cũng được); hiển thị hết sau 5 giây | `typing-state.ts`, `session.ts:130` |
| Typing, phía server | từ chối sự kiện dày hơn 1 lần/giây mỗi socket; chỉ người đang ở trong room channel mới phát được    | `realtime.gateway.ts:31, 333`       |
| Presence            | gộp theo khoảng `PRESENCE_BATCH_MS` (mặc định 1 giây) cho từng server trước khi phát                | `realtime.gateway.ts:355-398`       |

Một lưu ý nhỏ: bộ gộp presence giữ `Map` và bộ hẹn giờ trong RAM của từng tiến trình API. Nó chỉ là bộ đệm ngắn hạn 1 giây nên không giữ dữ liệu dài, nhưng quy tắc 1 trong CLAUDE.md cấm state dùng chung trong RAM, nên nếu muốn đủ rành thì ghi lại lý do trong ADR (có thể đã có sẵn, chưa kiểm tra).

**Đề xuất cho Ping:** giữ nguyên. Nếu sau này đo thấy sự kiện `presence.updated` chiếm nhiều lưu lượng khi một tài khoản 69 server kết nối lại liên tục (69 lần gộp, mỗi lần phát tới toàn bộ server đó), cân nhắc debounce theo người dùng để một lần rớt mạng ngắn không tạo ra cặp online/offline liền nhau.

## Phân quyền

Mô hình quyền của Ping là bản đơn giản ở cấp server của mô hình Discord và đã có rào chắn quan trọng nhất (không ai trao được quyền mình không có); phần Discord có mà Ping chưa có là ghi đè quyền theo channel.

**Discord làm gì** ([discord.js Guide, permissions](https://discordjs.guide/popular-topics/permissions-extended)):

- Gộp quyền của mọi role thành tập cơ sở, rồi áp ghi đè của channel theo đúng 6 bước: cấm của `@everyone`, cho của `@everyone`, cấm của các role còn lại (cùng lúc), cho của các role đó, cấm riêng thành viên, cho riêng thành viên. Bước sau ghi đè bước trước, trong mỗi tầng “cho” được áp sau “cấm” nên “cho” thắng.
- `Administrator` không bị ghi đè theo channel chi phối, nhưng vẫn phải qua kiểm tra thứ bậc.
- Thứ bậc role: không sửa được role ngang hoặc cao hơn role cao nhất của mình, và không trao được quyền mình không có.

**Ping hiện tại** (`packages/shared/src/permissions.ts`, `ability.ts`):

| Khía cạnh             | Discord                                      | Ping                                                                                                            |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Đơn vị quyền          | bitfield theo role                           | bitfield `bigint` theo role, 13 cờ (`Permissions`)                                                              |
| Owner và admin        | không bị ghi đè channel chi phối             | owner hoặc `ADMINISTRATOR` → `can('manage', 'all')`                                                             |
| Ghi đè theo channel   | 6 bước ở trên                                | chưa có: `schema.prisma` không có bảng ghi đè                                                                   |
| Chống leo thang quyền | thứ bậc role, không trao quyền mình không có | `canManagePermissions`: cần `MANAGE_ROLES` và tập bit nằm trong quyền của mình; `canKickMember` cùng nguyên tắc |
| Nơi định nghĩa luật   | trong dịch vụ                                | duy nhất ở `defineAbilityFor` (quy tắc 9), có `defineDmAbilityFor` cho DM                                       |

**Đề xuất cho Ping:**

1. Giữ nguyên cách định nghĩa luật tập trung. Đây đúng là điều cần học: một hàm thuần tính quyền, dễ kiểm thử.
2. Chỉ thêm ghi đè theo channel khi có nhu cầu thật (channel riêng tư, channel chỉ đọc). Khi đó làm đúng thứ tự 6 bước của Discord, viết thành hàm thuần trong `packages/shared` kèm một test cho từng bước, đổi schema theo expand/contract (quy tắc 13), có ADR (15) và test IDOR (16).
3. Câu hỏi mở: role có cột `position`, nhưng mình chưa kiểm tra nó có tham gia luật thứ bậc hay không; luật hiện tại dựa trên tập con của quyền. Bạn nên quyết định có muốn thứ bậc kiểu Discord hay không trước khi mở rộng tính năng role.

## Gửi tin nhắn

Ping đã có đủ cơ chế gửi tin an toàn mà Discord dùng (nonce chống gửi trùng, giới hạn tần suất, quyền ping `@everyone`), nên mục này không cần sửa; điểm đáng mượn là cách đếm theo (user, channel) cho các route khác.

**Discord làm gì** ([discord-api-types, create message](https://discord-api-types.dev/api/discord-api-types-v9/interface/RESTPostAPIChannelMessageJSONBody)):

- `nonce` dùng cho gửi lạc quan. Khi đặt `enforce_nonce`, API kiểm tra nonce đã dùng trong vài phút gần đây: cùng tác giả đã gửi nonce đó thì trả tin cũ, không tạo tin mới.
- `allowed_mentions` giới hạn loại mention được phép kích hoạt thông báo. Mình chỉ đọc được mô tả ngắn của trường này, chưa đọc đặc tả chi tiết.

**Ping hiện tại** (`messages.service.ts`, `message-rate-limiter.ts`, `mention-parser.ts`):

| Khía cạnh                 | Discord                        | Ping                                                                                                                                   |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Chống gửi trùng           | nonce, kiểm tra trong vài phút | `@@unique([channelId, authorId, nonce])`, gửi lại cùng nonce thì trả đúng tin cũ (`messages.service.ts:603`), không giới hạn thời gian |
| Giới hạn tần suất gửi tin | theo route và theo channel     | 10 tin mỗi 10 giây cho mỗi (user, channel); Redis chết thì cho qua (quy tắc 17)                                                        |
| Quyền ping `@everyone`    | có quyền riêng                 | cờ `MENTION_EVERYONE`, parser riêng cho mention                                                                                        |

`MessageRateLimiter` nêu rõ lý do đặt trong service: throttler toàn cục chạy trước `JwtAuthGuard` nên không biết `userId`. Đây cũng là lý do bộ đếm chung đếm theo IP (xem mục Rate limit).

**Đề xuất cho Ping:**

1. Giữ nguyên cơ chế nonce và giới hạn gửi tin; Ping thậm chí chặt hơn Discord ở chỗ không có cửa sổ thời gian.
2. Dùng lại mẫu đếm theo (user, channel) cho các route đọc nặng, thay vì IP. Đây là cách sửa phần đếm theo IP trong mục Rate limit.
3. Nếu sau này cần “trả lời mà không ping”, đọc đặc tả `allowed_mentions` của Discord trước khi thiết kế.

## Tìm kiếm tin nhắn

Postgres full-text của Ping phù hợp quy mô hiện tại; bài học từ Discord là giới hạn phạm vi tìm theo server, đặt rate limit riêng, và chỉ chuyển sang hệ thống tìm kiếm riêng khi số tin lên hàng trăm triệu.

**Discord làm gì** ([How Discord Indexes Trillions of Messages](https://discord.com/blog/how-discord-indexes-trillions-of-messages), bài tháng 4/2025):

- Năm 2017: Elasticsearch trên hai cluster, tin nhắn chia theo guild hoặc DM. Lập chỉ mục lười: tin đi qua hàng đợi, worker lấy từng lô để đưa vào chỉ mục.
- Các vấn đề khi lớn lên: hàng đợi Redis rớt tin khi ùn; một node hỏng làm hỏng khoảng 40% thao tác bulk trong cluster 100 node với lô 50 tin; cluster quá 200 node gây mất ổn định; guild lớn chạm trần khoảng 2 tỷ tin của Lucene trên một index.
- Thiết kế mới: nhiều cluster nhỏ gom thành “cell”, mỗi index giữ dưới khoảng 200 triệu tin và 50 GB; thay Redis bằng Pub/Sub đảm bảo giao; bộ định tuyến gộp tin theo đích để mỗi lần bulk chỉ đụng một node. Guild rất lớn có cluster riêng. Trung vị thời gian truy vấn giảm từ 500 ms xuống dưới 100 ms.

**Ping hiện tại** (`search.service.ts:57-84`, `search-rate-limiter.ts`):

- Tìm bằng Postgres: `websearch_to_tsquery('simple', unaccent(q))` trên cột `search` có index GIN (`Message_search_key`), hoặc `ILIKE '%q%'` trên nội dung đã bỏ dấu.
- Luôn giới hạn trong một server (`WHERE c."serverId" = ...`), sắp theo `id` giảm dần, phân trang bằng cursor, có `limit`.
- Có giới hạn 30 lần tìm mỗi phút cho mỗi người và độ dài truy vấn tối đa (`Limits.SEARCH_QUERY_MAX`).

**Điểm cần đo:** nhánh `OR ... ILIKE '%q%'` không dùng được index GIN đó, nên với server có nhiều tin Postgres có thể phải quét rộng. Mình chưa chạy `EXPLAIN ANALYZE` nên đây là nghi vấn từ đọc SQL, chưa phải kết luận.

**Đề xuất cho Ping:**

1. Không cần Elasticsearch. Discord cần vì có hàng tỷ tin và guild khổng lồ; với nhóm nhỏ Postgres là đủ.
2. Chạy `EXPLAIN ANALYZE` cho truy vấn trên server lớn nhất của bạn. Nếu nhánh `ILIKE` bị quét tuần tự, có hai hướng: chỉ chạy `ILIKE` khi full-text trả ít kết quả, hoặc thêm index `pg_trgm` cho nội dung đã bỏ dấu (cần migration expand/contract theo quy tắc 13 và ADR). Kiểm tra hướng thứ hai trên docs Postgres đúng phiên bản đang dùng trước khi làm.
3. Giữ giới hạn phạm vi theo server và rate limit riêng cho tìm kiếm, đúng thứ Discord dùng để bảo vệ hệ thống tìm kiếm.

## Thông báo và mute

Ping có cùng mô hình hai tầng với Discord (server và channel) kèm thời hạn mute, và hàm quyết định `shouldNotify` nằm trong `packages/shared`; điều cần làm là chốt và test luật ưu tiên khi hai tầng mâu thuẫn.

**Discord làm gì** ([Notification Settings 101](https://support.discord.com/hc/en-us/articles/215253258)):

- Mỗi server có cài đặt mặc định cho các channel của nó. Ghi đè theo channel hoặc theo category với bốn mức: All, Mentions, Nothing, Mute; ghi đè có hiệu lực dù server đang có cài đặt khác.
- Mute server tắt mọi thông báo có thời hạn, nhưng `@everyone` vẫn tới; mute channel tắt cả `@mention`.
- Có các công tắt riêng: tắt `@everyone` và `@here`, tắt mọi mention theo role, tắt highlight, và push trên di động.
- Bài viết không nêu luật ưu tiên cho mọi trường hợp, ví dụ channel đặt All trong server đang mute.

**Ping hiện tại** (`schema.prisma`, `packages/shared/src/schemas/notification.ts:47`):

| Khía cạnh             | Discord                      | Ping                                                                                       |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Tầng cài đặt          | server, category, channel    | `NotificationPref` với `scope` là server hoặc channel, duy nhất theo (user, scope, target) |
| Mức                   | All, Mentions, Nothing, Mute | `level` (`none`, `mentions`, và mức mặc định), thêm `mutedUntil`                           |
| Mute có thời hạn      | có                           | `mutedUntil` là mốc thời gian, mute tương lai chặn cả mention                              |
| `@everyone` khi mute  | vẫn tới (mute server)        | bị chặn hết khi đang mute                                                                  |
| Tắt `@everyone` riêng | có                           | cờ `ignoreEveryone`                                                                        |
| Tắt mention theo role | có                           | chưa có                                                                                    |
| Push di động          | có                           | chưa có (Ping chỉ dành cho desktop theo CLAUDE.md)                                         |

Mình chưa đọc `notifications.service.ts` nên chưa biết khi đủ hai tầng server và channel thì tầng nào thắng.

**Đề xuất cho Ping:**

1. Giữ nguyên cấu trúc; hàm thuần trong `packages/shared` là đúng thứ Discord làm và dễ kiểm thử.
2. Chốt luật: channel ghi đè server (như Discord nói), viết test cho trường hợp channel đặt All trong server đang mute, vì ngay cả tài liệu Discord cũng không nêu.
3. Thêm category (Ping đã có category) và tắt mention theo role chỉ khi người dùng thực sự cần.

## Giới hạn trên kết nối realtime

Ping đã bảo vệ kết nối socket theo đúng tinh thần của Discord (giới hạn số sự kiện, kích thước gói, số kết nối mỗi người) và thậm chí mềm hơn ở chỗ bỏ qua trước khi ngắt; chỉ còn vài thông số nên kiểm tra lại.

**Discord làm gì** ([Gateway, tài liệu Discord](https://docs.discord.com/developers/topics/gateway)):

- Mỗi kết nối được gửi tối đa 120 sự kiện mỗi 60 giây (trung bình 2 sự kiện mỗi giây). Vượt thì bị ngắt ngay, tái phạm có thể mất quyền dùng API.
- Gói sự kiện client gửi không được quá 4096 byte, lớn hơn thì đóng kết nối với mã 4002.
- Heartbeat: lần gửi đầu tiên sau `heartbeat_interval × jitter` (jitter ngẫu nhiên từ 0 đến 1) để các kết nối không cùng gửi một lúc; không nhận được ACK trước heartbeat kế tiếp thì coi kết nối là “zombie”, đóng và nối lại.
- Giới hạn số lần Identify (xác thực kết nối mới), tính theo 5 giây và theo 24 giờ; Resume không tính.

**Ping hiện tại** (`realtime.gateway.ts`, `redis-io.adapter.ts`, `socket.ts`):

| Khía cạnh                           | Discord                             | Ping                                                                                     |
| ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Số sự kiện mỗi kết nối              | 120 mỗi 60 giây, vượt là ngắt       | cửa sổ 1 giây: trên 20 sự kiện thì bỏ qua, trên 60 thì ngắt (`overBudget`)               |
| Kích thước gói client gửi           | 4096 byte                           | `maxHttpBufferSize: 4 * 1024` (4 KB, bằng Discord)                                       |
| Số kết nối mỗi người                | không nêu ở nguồn đã đọc            | tối đa 10 (`MAX_SOCKETS_PER_USER`)                                                       |
| Heartbeat và phát hiện kết nối chết | heartbeat tự định nghiệm, có jitter | do Socket.IO lo; Ping không cấu hình `pingInterval` hay `pingTimeout`                    |
| Nối lại phía client                 | resume với `seq`                    | `createSocket` đặt nối lại có jitter (1–10 s, lệch ±50% mỗi lần); chưa resume theo `seq` |

**Đề xuất cho Ping:**

1. Giữ cơ chế hai mức mềm (bỏ qua rồi mới ngắt); đây là thứ tốt hơn ngắt ngay của Discord cho một ứng dụng mà client do chính bạn viết.
2. Cân nhắc hạ `maxHttpBufferSize` xuống sát kích thước thật của sự kiện client gửi (join, leave, typing, chỉ vài trăm byte); Discord giới hạn 4 KB. Đừng hạ nếu còn sự kiện nào mang nội dung dài.
3. Đọc docs Socket.IO đúng version đang cài về tùy chọn nối lại (backoff và ngẫu nhiên hóa thời gian chờ) để đảm bảo khi API khởi động lại, mọi client không đồng loạt nối lại cùng một giây, đây là mục đích của jitter trong heartbeat Discord. Mình chưa kiểm chứng giá trị mặc định của bản đang dùng.
4. Dùng bài kiểm thử reconnect storm (skill `load-test-report`) để đo khi kết hợp với việc gộp unread.

## Lộ trình sửa cho Ping

Làm theo thứ tự dưới đây: ba việc đầu khắc phục được phần lớn 429 và lag, các việc sau là bảo hiểm và tối ưu. Mức tác động và công sức là ước lượng của mình từ việc đọc code, chưa phải số đo.

Nên bắt đầu từ việc 1 đến 3: tác động cao, công sức thấp đến trung bình (việc 1 cần sửa cả API lẫn web). Các việc còn lại xếp theo thứ tự trong bảng; sơ đồ ma trận tác động và công sức chỉ có ở bản trực tuyến.

| #   | Việc                                                                             | Tác động                     | Công sức          | File chính                                                                                                                | Test và thủ tục theo CLAUDE.md                                                         |
| --- | -------------------------------------------------------------------------------- | ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Gộp unread thành một request cho mọi server, `setQueryData` từng `qk.unread(id)` | Rất cao: 69 request thành 1  | Trung bình        | `channels.controller.ts`, `read-state.service.ts`, `packages/shared`, `features/unread/{api,hooks}.ts`, `server-rail.tsx` | Zod + CASL (quy tắc 9), test IDOR (16), `api-conventions` (19), có thể cần ADR (15)    |
| 2   | Client tôn trọng `Retry-After`, có hàng đợi, không retry 429 ngay                | Cao                          | Thấp – trung bình | `lib/api-client.ts`, `lib/query-client.ts`                                                                                | Test Vitest cho hàng đợi, `reportError` vẫn hoạt động (quy tắc 20)                     |
| 3   | Ảnh: chỉ lấy thumbnail, chỉ lấy khi vào vùng nhìn, bỏ `refetchInterval`          | Cao khi kênh nhiều ảnh       | Thấp              | `attachments/hooks.ts`, `attachment-list.tsx`                                                                             | Playwright (`e2e/`), `a11y.spec.ts`, `check:bundle`                                    |
| 4   | Rate limit: giảm `blockDuration`, tách bucket đọc nhẹ và ghi, đếm theo user      | Trung bình                   | Thấp – trung bình | `app.module.ts`, `decorators.ts`, `http-throttler.guard.ts`                                                               | Sửa dòng “100 req/phút/IP” trong CLAUDE.md, ADR nếu đổi quyết định cũ                  |
| 5   | SQL unread: so sánh ID thay `count(*)`, chặn trần ngay trong truy vấn            | Trung bình – cao phía server | Trung bình        | `read-state.service.ts`                                                                                                   | `EXPLAIN ANALYZE` trước và sau, test service; đổi schema thì theo expand/contract (13) |
| 6   | Reconnect: không invalidate mọi server; về sau phát bù sự kiện theo số thứ tự    | Trung bình                   | Cao (bản đầy đủ)  | `unread/hooks.ts`, `realtime.gateway.ts`, `packages/shared`                                                               | ADR + skill `realtime-event-contract`, kịch bản reconnect storm của `load-test-report` |
| 7   | Trả link ký cùng dữ liệu tin nhắn, nâng TTL link                                 | Trung bình                   | Trung bình        | `attachments.service.ts`, `messages.service.ts`, `packages/shared/schemas/attachment.ts`                                  | Đổi hợp đồng response (19), test IDOR                                                  |
| 8   | Đo `/members` và gộp đọc trùng cho truy vấn nóng                                 | Thấp                         | Trung bình        | `servers.service.ts`, `realtime.service.ts`                                                                               | Chỉ làm nếu số đo cho thấy là nút thắt; ADR nếu đụng state trong RAM                   |

**Việc bổ sung từ các mục Phân quyền, Tìm kiếm, Thông báo và Giới hạn realtime** (chưa đưa lên sơ đồ; việc 9 đến 11 độc lập với 8 việc trên):

| #   | Việc                                                                                                               | Tác động                  | Công sức          | File chính                                                                | Test và thủ tục theo CLAUDE.md                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 9   | Chạy `EXPLAIN ANALYZE` cho tìm kiếm; xử lý nhánh `ILIKE` (chỉ chạy khi full-text ít kết quả, hoặc index `pg_trgm`) | Trung bình với server lớn | Thấp – trung bình | `search.service.ts`                                                       | `EXPLAIN` trước và sau; nếu thêm index thì expand/contract (13) và ADR (15)        |
| 10  | Chốt luật ưu tiên thông báo channel hơn server và thêm test cho trường hợp channel đặt All trong server đang mute  | Thấp                      | Thấp              | `packages/shared/src/schemas/notification.ts`, `notifications.service.ts` | Vitest cho `shouldNotify`                                                          |
| 11  | Hạ `maxHttpBufferSize`, đặt tùy chọn nối lại có ngẫu nhiên hóa thời gian chờ                                       | Thấp                      | Thấp              | `redis-io.adapter.ts`, `features/realtime/socket.ts`                      | e2e realtime, kịch bản reconnect storm                                             |
| 12  | Quyết định có thứ bậc role kiểu Discord và ghi đè quyền theo channel hay không                                     | Tuỳ nhu cầu               | Cao nếu làm       | `packages/shared/src/ability.ts`, `schema.prisma`                         | ADR, expand/contract (13), test IDOR (16); chỉ làm khi có nhu cầu channel riêng tư |

**Cách kiểm chứng sau mỗi việc:** F5 một lần trên tài khoản 69 server rồi đếm lại bằng `performance.getEntriesByType('resource')`: số request `/unread`, số 429, thời gian `/me/permissions`. Mục tiêu hợp lý sau việc 1: 1 request unread, 0 lỗi 429, `/permissions` quay về khoảng 0,4 giây. Sau đó chạy `pnpm lint`, `pnpm typecheck`, `pnpm test` và e2e khi đổi UI.

**Trạng thái 2026-11-06 (nhánh `feat/discord-practices`):** việc 1–4 đã làm — [ADR-0077](adr/0077-unread-gop-mot-request.md) gộp unread, [ADR-0078](adr/0078-hang-doi-request-va-retry-after.md) hàng đợi tôn trọng `Retry-After`, [ADR-0079](adr/0079-tai-tep-dinh-kem-luoi.md) tải tệp lười, [ADR-0080](adr/0080-rate-limit-theo-bucket-va-nguoi-dung.md) rate limit theo bucket + khoá theo người dùng. Đo lại một lần F5 trên tài khoản 69 server (bản dev, cùng cách đo): 1 request `/users/me/unread`, 0 lỗi 429, `/me/permissions` 1,1 giây (trước 8,0 giây), tổng 18 request API (trước 92). Số 1,1 giây cao hơn mục tiêu 0,4 giây (máy dev local, số tuyệt đối có thể khác production), nhưng đã hết cảnh xếp hàng sau 69 request unread.

**Đề xuất ADR:** việc 1 (endpoint mới) và việc 4 (đổi chính sách rate limit) đáng có mỗi việc một ADR ngắn; việc 6 bắt buộc có ADR. Các việc còn lại là sửa cài đặt, không đổi kiến trúc.

## Nguồn và mức độ chắc chắn

Tất cả trang dưới đây đã được mở để lấy thông tin (tra cứu ngày 2026-11-06). Số đo của Ping lấy từ Chrome trên bản dev `localhost:3000` cùng ngày.

| Nguồn                                                                                                                                          | Dùng cho                                  | Độ tin cậy                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| [Rate Limits, Discord](https://docs.discord.com/developers/topics/rate-limits)                                                                 | bucket, header, 429, ngưỡng request lỗi   | Tài liệu chính thức                                  |
| [Gateway Events, Discord](https://docs.discord.com/developers/topics/gateway-events)                                                           | Ready, Resume, Guild Create, member chunk | Tài liệu chính thức (dành cho bot)                   |
| [Read State, Discord Userdoccers](https://discord-userdoccers.pages.dev/topics/read-state)                                                     | unread, mention\_count, ack               | Tài liệu cộng đồng, không phải của Discord           |
| [Why Discord is switching from Go to Rust](https://discord.com/blog/why-discord-is-switching-from-go-to-rust)                                  | service Read States, cache LRU            | Bài blog Discord, số liệu theo thời điểm bài viết    |
| [How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages?s=09)                             | lưu trữ tin nhắn, request coalescing      | Bài blog Discord (cập nhật 2023)                     |
| [Scaling Elixir to 5 million users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)                          | fanout, guild lớn, presence               | Bài blog Discord, số liệu cũ, có thể đã đổi          |
| [BleepingComputer, 2023](https://www.bleepingcomputer.com/news/security/discord-will-switch-to-temporary-file-links-to-block-malware-delivery) | link CDN có hạn 24 giờ                    | Báo thứ ba, viết khi việc triển khai còn sắp diễn ra |
| [discord.py thảo luận #5969](https://github.com/Rapptz/discord.py/discussions/5969)                                                            | typing khoảng 10 giây                     | Nguồn yếu, chỉ mang tính tham khảo                   |

**Chưa kiểm chứng, nên coi là giả thuyết:**

- Discord gửi read state một lần trong `READY`: theo hiểu biết chung của mình, không có trong nguồn đã đọc.
- Throttler của Ping có đếm request `OPTIONS` hay không.
- Socket.IO bản đang cài có hỗ trợ khôi phục trạng thái kết nối với adapter Redis hay không.
- Chi phí thật của SQL unread và `/members` (cần `EXPLAIN ANALYZE`).
- ADR hiện có của Ping về bộ gộp presence trong RAM (mình chưa đọc `docs/adr/`).

**Nguồn bổ sung** (đã mở để lấy thông tin):

- [Permissions, discord.js Guide](https://discordjs.guide/popular-topics/permissions-extended): thứ tự tính quyền và thứ bậc role. Tài liệu của thư viện cộng đồng, không phải của Discord.
- [discord-api-types, create message](https://discord-api-types.dev/api/discord-api-types-v9/interface/RESTPostAPIChannelMessageJSONBody): `nonce`, `enforce_nonce`. Chú thích của thư viện kiểu, không phải trang đặc tả chính thức.
- [How Discord Indexes Trillions of Messages](https://discord.com/blog/how-discord-indexes-trillions-of-messages): tìm kiếm. Bài blog Discord, tháng 4/2025.
- [Gateway, Discord](https://docs.discord.com/developers/topics/gateway): giới hạn sự kiện, heartbeat, resume. Tài liệu chính thức.
- [Notification Settings 101, Discord Support](https://support.discord.com/hc/en-us/articles/215253258): cài đặt thông báo. Bài hướng dẫn người dùng, không định nghĩa luật ưu tiên đầy đủ.

**Chưa kiểm chứng thêm:**

- Discord có quyền riêng cho ping `@everyone` (theo hiểu biết chung của mình, không có trong nguồn đã đọc).
- `allowed_mentions` làm chính xác những gì (chỉ đọc mô tả một dòng).
- Giá trị mặc định của tùy chọn nối lại trong bản Socket.IO đang cài.
- Cách `notifications.service.ts` chọn giữa cài đặt server và channel.
- Vai trò của cột `position` của role trong luật thứ bậc.

# Hỏi đáp phỏng vấn — Ping v0.2.0

Trạng thái: hoàn thiện tại T7.5 (2026-11-01). **45 câu** chia theo 9 case study và phần tổng quan.
Mỗi câu trả lời ngắn (2–5 câu), bám số đo có thật trong evidence; chỗ chưa đo thì nói "chưa đo",
không suy ra từ kế hoạch. Kết thúc bằng [điều tôi sẽ làm khác đi](#điều-tôi-sẽ-làm-khác-đi).

Quy ước: câu hỏi in đậm, câu trả lời ngay dưới; số trong ngoặc là nguồn (case/ADR/evidence).

## Tổng quan

**1. Ping là gì, ai dùng?**

Ứng dụng chat realtime tự dựng kiểu Discord: server, kênh (kể cả danh mục), tin nhắn realtime,
reply/reaction/ghim, tệp đính kèm, tìm kiếm, DM, thông báo, kiểm duyệt và hỏi AI trên nội dung
server. Mục tiêu là một sản phẩm chạy được để học và để chứng minh các quyết định kỹ thuật, không
phải bản demo giao diện. Người dùng giả định là một nhóm nhỏ (quy mô pilot 5–10 người); chưa có
người dùng thật nào ngoài tôi.

**2. Vì sao tự làm thay vì dùng Mattermost/Matrix?**

Vì mục tiêu là bài tập kỹ thuật có kiểm chứng, không phải chọn sản phẩm nhanh nhất. Tự làm cho
phép kiểm soát ba chỗ khó (giao tin không mất/không lặp, quyền không rò rỉ, LLM là dependency
không tin cậy) và đo được chúng. Cái giá là thiếu hệ sinh thái, mobile native và vận hành chuyên
nghiệp — tôi ghi rõ phần thiếu thay vì giả vờ có ([phạm vi](../adr/0038-release-scope-v0.2.0.md)).

**3. Phần nào khó nhất?**

Không phải tính năng mà là **ranh giới tin cậy**: quyết định chỗ nào server phải kiểm lại thay vì
tin client hoặc tin LLM. Ba ví dụ: guard tìm kiếm phải là `view Message` chứ không phải
`view Server` ([case 4](case-studies/cs-04-search-acl.md)); mọi UUID trong câu trả lời AI phải
thuộc ngữ cảnh đã hydrate ([case 5](case-studies/cs-05-untrusted-llm.md)); URL tệp có chữ ký vẫn
phải đọc lại quyền từ Postgres ([case 9](case-studies/cs-09-upload-markdown-dm-privacy.md)).

**4. Nếu chỉ được giữ ba tính năng?**

Gửi/nhận tin realtime có phục hồi khoảng trống, phân quyền theo vai trò, và DM riêng tư. Ba thứ
này tạo thành một sản phẩm chat dùng được; search, AI, sticker, emoji chỉ là lớp cộng thêm.

**5. Vì sao phạm vi v0.2.0 dừng ở đây?**

Phần tính năng đã đóng; thứ bị cắt là những mảng cần hạ tầng hoặc người thật: voice/video, mã hoá
đầu cuối, S3, đa server, mobile native ([ADR-0038](../adr/0038-release-scope-v0.2.0.md)), cộng pilot
5–10 người. Phần vận hành cơ bản (VPS công khai, HTTPS, backup mã hoá,
rollback, load test profile nhỏ) đã chạy thật trên production; ô nào chưa đo vẫn để "chưa đo" trong
[nghiệm thu](acceptance/v0.2.0.md) thay vì điền số ước lượng.

## Case 1 — Bão presence

**6. "Bão presence" là gì và số đo ra sao?**

Khi nhiều socket nối lại cùng lúc, mỗi thay đổi trạng thái lại phát cho mọi socket → số event bùng
nổ. Đo trên laptop với v0.1.0: 2.000 socket trong một server, 3 vòng đóng/nối 15 giây → khoảng
**4,9 triệu event trong 90 giây** (~23.500 event/giây), 2.541 lần nối thất bại, p95 hồi phục
**25,3 giây** ([case 1](case-studies/cs-01-presence-storm.md)). Ở profile nhỏ hơn (500 socket,
3 instance) là 919.318 thông điệp trong 71,2 giây, p95 3,14 giây, event loop p99 778,6 ms.

**7. Sửa bằng cách nào?**

Gộp theo cửa sổ: trong `PRESENCE_BATCH_MS` (mặc định 1.000 ms; 0 = phát ngay), nhiều thay đổi của
cùng một user chỉ phát một lần, và tách presence khỏi đường xác thực để lỗi presence không làm
hỏng handshake. Đây là đánh đổi có chủ ý: presence trễ ~1 giây.

**8. Vì sao chọn trễ 1 giây thay vì phát ngay?**

Vì presence là dữ liệu "mềm": người dùng không nhận ra 1 giây, nhưng hệ thống nhận ra ngay sự
khác biệt giữa 23.500 event/giây và một phần nhỏ của nó. Nếu sản phẩm cần "đang gõ" tức thời thì
phải tách kênh tín hiệu khác — hiện chưa làm.

## Case 2 — Outbox và gap recovery

**9. Vì sao không ghi DB rồi phát event luôn?**

Vì hai thao tác đó không nằm trong cùng một transaction: ghi xong, phát thất bại (Redis chập chờn,
process chết) là tin "đã gửi" nhưng người khác không bao giờ thấy. Outbox ghi `OutboxEvent` trong
**cùng transaction** với `Message`, relay poll `FOR UPDATE SKIP LOCKED` rồi publish, chỉ đánh dấu
`publishedAt` sau khi publish thành công → at-least-once phía server.

**10. At-least-once thì làm sao client không thấy tin trùng?**

Client upsert theo `id` và `nonce`: hai lần gửi song song cùng nonce cho ra cùng một hàng trong DB,
optimistic + event cùng nonce gộp làm một. Test hỗn loạn nhẹ (rớt frame, đảo thứ tự) cho thấy hiển
thị không trùng và đúng thứ tự nhờ chèn theo id ([case 2](case-studies/cs-02-outbox-gap-recovery.md)).

**11. Client mất mạng đúng lúc có tin thì sao?**

Gap recovery: sau khi join lại thành công, client lấy tail của cache làm con trỏ và lặp
`GET /channels/:id/messages?after=<tail>` (tăng dần, `hasMore`, trần 100/trang) rồi vá vào cache.
Bản vá upsert khớp id/nonce, bỏ tin đã bị xóa trong khoảng, giữ tin optimistic — [ADR-0044](../adr/0044-gap-recovery.md).

**12. Sao không có cột `seq` tăng dần?**

Vì id là UUIDv7 sinh theo thời gian nên `id` đã là khóa sắp xếp tốt, dùng luôn làm con trỏ cursor
(`WHERE id > tail ORDER BY id`) mà không cần thêm cột và index thứ hai. Đổi lại, thứ tự phụ thuộc
đồng hồ máy sinh id — chấp nhận được ở một node, sẽ phải xem lại nếu chạy nhiều node ghi.

**13. Test offline có thật không?**

Có: web e2e `gap-recovery.spec.ts` đóng bridge WebSocket thật, gửi 100 tin từ 3 tài khoản (nhịp
400 ms để tránh hai lớp rate limit), xóa 1 tin trong lúc offline rồi nối lại — còn đủ 99 tin đúng
thứ tự, không trùng, banner mất kết nối tự biến mất.

## Case 3 — Unread đa thiết bị

**14. Unread đếm thế nào, vì sao có trần 100?**

Một truy vấn lateral trên bảng membership/read-state cho mọi kênh của một server, đếm tin mới hơn
con trỏ đã đọc, trừ tin của chính mình và tin xóa mềm. Trần 100 vì badge chỉ cần biết "nhiều", còn
đếm chính xác mọi tin là chi phí không cần thiết ([case 3](case-studies/cs-03-unread-multidevice.md)).

**15. Hai tab của cùng một người thì sao?**

Đánh dấu đã đọc phát `read.updated` tới mọi socket của user đó, nên badge ở tab kia sạch ngay —
test hai tab có trong T4.2/T4.3. Đây là lý do read-state nằm ở server chứ không ở localStorage.

**16. Bài học nào đáng nhớ ở case này?**

Đổi `aria-label` theo trạng thái unread làm **15 spec e2e vỡ**: tên tiếp cận là hợp đồng, không
phải nhãn trang trí. Từ đó tôi coi chuỗi a11y như API công khai.

## Case 4 — Tìm kiếm và ACL

**17. Vì sao FTS của Postgres thay vì Elastic/Meilisearch?**

Vì phải vận hành, sao lưu, đồng bộ thêm một hệ — vượt ngân sách 0 USD của pilot. FTS + GIN trigram
đủ cho 20.000 tin seed, độ trễ p95 thấp, và quan trọng nhất: lọc quyền nằm **trong cùng câu SQL**
nên không có cửa sổ "lấy dữ liệu rồi mới lọc" ([ADR-0045](../adr/0045-full-text-search.md)).

**18. Tiếng Việt xử lý thế nào?**

Cấu hình `simple` + `f_unaccent` (wrapper `IMMUTABLE` có schema-qualify, nếu không inlining làm
mất dictionary khi tạo cột/index) cho FTS, và GIN trigram trên nội dung đã bỏ dấu cho tìm con
chuỗi. Nhờ vậy "hoa" khớp "hoà" và gõ dở "áo c" vẫn ra.

**19. "Lỗ ACL thật" là gì?**

Ở T6.5 tôi phát hiện guard của endpoint search là `view Server`: một member **thiếu** `VIEW_CHANNEL`
vẫn đọc được nội dung kênh ẩn qua search. Vá bằng cách đổi sang `view Message` và thêm ca IDOR tương
ứng; đây là lý do tôi không tin "đã có guard" mà kiểm từng route.

**20. Search nhanh không?**

p95 local trên 20.000 tin: từ phổ biến ("báo cáo") **51,3 ms**, cụm 2 từ ("họp nhóm") **8,5 ms**,
trigram con chuỗi **19,9 ms**, không khớp **1,4 ms**. Đây là baseline local, **không phải p95
staging** — chưa có số T6.1 cho search.

**21. Sao không dùng hybrid RRF đã có embedding?**

Vì nó là task stretch bị cắt ([ADR-0038](../adr/0038-release-scope-v0.2.0.md)); làm nửa vời sẽ
phải ghi "chưa đo" ở đúng chỗ người đọc quan tâm nhất. Tôi giữ FTS thuần và nói rõ giới hạn thay
vì trộn số của embedding RAG vào báo cáo search.

## Case 5 — LLM là dependency không tin cậy

**22. Làm sao tin được câu trả lời của LLM?**

Không tin nội dung, chỉ tin ranh giới backend kiểm được: quyền và quota kiểm trước prompt; vector
candidates được hydrate lại từ Postgres để có nội dung thật; mọi UUID trong câu trả lời phải thuộc
ngữ cảnh đã hydrate, nếu không thì **không phát** ([ADR-0048](../adr/0048-controlled-vector-retrieval.md)).

**23. Citation guard kiểm chính xác cái gì?**

Hai điều: UUID có trong tập ứng viên đã hydrate (không phải id bịa) và được bọc đúng quy ước trong
câu trả lời. Sai một trong hai → `AI_NO_CITATION`, stream dừng trước khi phát delta. Trong buổi
demo gần nhất, guard từ chối thật vì model trả lời không kèm trích dẫn hợp lệ.

**24. Chi phí và quota xử lý thế nào?**

Quota theo user và ngân sách theo ngày; vượt thì trả mã lỗi riêng (`AI_QUOTA_EXCEEDED`,
`AI_BUDGET_EXHAUSTED`) chứ không im lặng ([ADR-0047](../adr/0047-ai-quota-budget-cache.md)). Chạy
free tier Groq; thiếu key thì tính năng tự tắt (`AI_UNAVAILABLE`), không có đường gọi mạng ngầm.

**25. Cache AI hoạt động ra sao?**

Key theo câu hỏi + ngữ cảnh + namespace phiên bản chính sách; chỉ nhận và trả lại output đã qua
guard. Đo local: cache miss **1.860 ms**, hit **32 ms** cho cùng câu hỏi. Namespace tăng khi chính
sách đổi để không tái dùng câu trả lời cũ — không flush Redis.

**26. Bạn đánh giá chất lượng AI bằng gì?**

30 câu hỏi vàng + 12 payload injection trên 50 tin demo, chạy end-to-end với Postgres/CASL/hydrate
thật, vector/LLM giả chỉ để kiểm ranh giới. Bộ hồi quy mở rộng 47 ca gồm cả outsider/bị kick,
chunk trộn tin server khác, tin đã xóa, metadata giả. Lỗi provider không được tính là "đã phòng thủ
thành công" ([ADR-0062](../adr/0062-ai-evaluation-and-citation-boundary.md)).

**27. Nếu câu trả lời đúng nhưng không có UUID thì sao?**

Vẫn bị từ chối. Đây là đánh đổi có chủ ý: thà mất một câu trả lời đúng còn hơn phát một câu không
kiểm chứng được. UI map `AI_NO_CITATION` thành thông báo riêng, không giả "AI đang bận".

## Case 6 — Vận hành dưới 20 USD

**28. "Dưới 20 USD" đã chứng minh chưa?**

Chưa. Có một VPS nhỏ chạy production bằng hạn mức của OWNER và không có dịch vụ trả
phí nào khác: LLM free tier, không S3, không Sentry, không domain. Nhưng tôi chưa có bảng giá từng
dòng, chưa ghi cấu hình máy bằng `nproc`/`free -m`, và chưa theo dõi đủ một chu kỳ, nên không tuyên
bố "đã vận hành dưới 20 USD" ([case 6](case-studies/cs-06-ops-under-20usd.md)).

**29. Vậy đã kiểm được gì?**

Hai drill trong CI dừng container thật: Redis chết → `/ready` `degraded` nhưng vẫn 200, gửi tin
201 trong < 1.500 ms, đăng nhập 503 fail-closed; Postgres chết → `/ready` 503, `/health` 200, request
DB 503 trong < 6.000 ms; cả hai phục hồi không cần restart. Thêm docker smoke qua Nginx HTTPS:
redirect, CSP, WebSocket, SIGTERM thoát mã 0.

**30. Drill đó có phải RTO không?**

Không. Đó là **ngưỡng assert** cho hành vi degrade/recover, không phải thời gian khôi phục sau sự
cố thật. RTO đã đo một lần trên snapshot production: ~4,5 giây cho 122 KB DB + 86 KB uploads, trong
đó Postgres restore 1,1 giây, giải nén uploads 0,1 giây, API sẵn sàng 3,2 giây. Con số đó **không đại
diện** cho dữ liệu lớn; RPO ≤ 24 giờ dựa vào cron hằng ngày, chưa có PITR
([V5-backup](evidence/V2-final/V5-backup.md)).

**31. Backup đã chạy thật chưa?**

Có, trên production: cron 02:30 UTC dump `-Fc` + tar volume uploads, mã hoá `age`, giữ 14 ngày;
bản `.age` được kéo về máy OWNER. Lần diễn tập 2026-11-14 restore vào DB mới: số hàng khớp tới mốc
chụp (179 + 3 tin ghi sau = 182), 22/22 hash tệp uploads trùng, `/ready` 200. Giới hạn: cron không
dừng API/worker nên snapshot không nhất quán tuyệt đối, và script kéo chưa đặt lịch
([runbook](../runbook/backup-restore.md)).

## Case 7 — Quy trình làm việc có rào chắn

**32. Vì sao cần hook và permissions khi làm một mình?**

Vì "một mình" không bảo vệ khỏi việc tự bỏ qua bước. Hook chặn lệnh nguy hiểm (đọc/ghi `.env`,
push sai nhánh), permissions buộc tôi khai báo ý định, và evidence mỗi task buộc phải chạy thật
chứ không viết suông ([case 7](case-studies/cs-07-claude-workflow.md)).

**33. "Lint theo tầng" nghĩa là gì?**

Mỗi tầng có luật riêng: `@ping/shared` không import từ app, UI không import antd trực tiếp (chỉ qua
33 wrapper `Ping*`), route không dùng `useParams` ngoài allowlist, icon phải import theo tên. Nhờ
vậy bundle và design system không trôi dần theo thời gian.

**34. 68 ADR có phải là quá nhiều?**

Có thể, nhưng mỗi ADR ghi một quyết định có thể bị hỏi ngược ("vì sao 403 ở đây mà 404 ở kia").
Cái giá là phải giữ chúng khớp với code — và tôi đã bắt được lỗi tài liệu thật khi rà lại (ví dụ
README từng ghi sai chính sách 403/404).

## Case 8 — Frontend và design system

**35. Vì sao dùng antd rồi bọc 33 component?**

Vì tự viết toàn bộ component phức tạp (Select, Modal, Table, Tooltip) tốn thời gian hơn giá trị
học. Bọc `Ping*` để app không import antd trực tiếp: đổi theme, đổi kit hay thêm hành vi a11y chỉ
sửa một chỗ ([ADR-0023](../adr/0023-web-ui-kit-and-tokens.md), [case 8](case-studies/cs-08-frontend-design-system.md)).

**36. Bundle 248,2 KB gzip bằng cách nào?**

Đo đúng "JS tải ban đầu" thay vì cộng mọi chunk, rồi đẩy phần nặng ra sau `next/dynamic`: search,
ngăn kéo AI, quick switcher (Ctrl/⌘+K) chỉ tải khi mở — 74 chunk lười 791,4 KB. Ngân sách ≤ 450 KB
còn dư 201,8 KB ([ADR-0058](../adr/0058-bundle-budget-initial-js.md)).

**37. LCP chat 2,9–3,5 giây có tệ không?**

Có, so với ngưỡng 2,5 giây. Nguyên nhân là chờ API tin + socket trên máy dev đang chạy Docker/e2e;
landing đạt 268–1.264 ms, CLS 0–0,0289 và INP 16–32 ms đều tốt. Tôi giữ số thật và để ngưỡng
performance ở mức warn thay vì hạ ngưỡng cho đẹp.

**38. Accessibility đã kiểm tới đâu?**

axe quét WCAG 2.1 A/AA trên các màn chính, sáng/tối, 375/768/1280 và các dialog — 0 vi phạm; 18/18
cặp màu đạt AA, thấp nhất 4,65:1; có `aria-live` cho tin mới và mention, focus trả về nút khi đóng
drawer. Giới hạn: axe không thay screen reader thật, và lỗi W1 (viền ô nhập dưới 3:1) vẫn chờ
OWNER quyết.

**39. Visual regression trông thế nào?**

36 baseline = 6 màn × 2 theme × 3 viewport, chụp trên build production với seed cố định, ẩn `<time>`
và thanh cuộn, `threshold 0,3` và `maxDiffPixelRatio 0,015`. Baseline tách theo hệ điều hành; job
`visual` là check bắt buộc ([ADR-0074](../adr/0074-visual-regression-baselines-va-ci.md)).

## Case 9 — Tệp, Markdown, DM

**40. Tệp đi qua pipeline nào?**

Reserve (giữ quota nguyên tử) → `PUT` nội dung → worker kiểm magic bytes, decode, reencode WebP bỏ
EXIF, tạo thumbnail → `ready`; tin chỉ gắn được tệp `ready`. Nhãn UI "Đang kiểm tra tệp…" →
"Sẵn sàng gửi" chính là trạng thái này; worker là process riêng nên thiếu nó là tệp đứng yên.

**41. Vì sao không quét virus?**

Vì không có ngân sách cho dịch vụ quét và không muốn giả vờ có. Thay vào đó là allowlist định dạng

- kiểm cấu trúc: **9/9 ca tệp độc hại bị chặn** (SVG/HTML/EXE, PDF active content, MIME giả).
  Giới hạn được ghi rõ: PDF vẫn cần trình đọc cập nhật.

**42. Markdown an toàn thế nào?**

Parser tự viết + AST allowlist, render thẳng sang React, không `innerHTML` — nên CSP còn
`'unsafe-inline'` cũng không thành lỗ. **16/16 payload XSS không thực thi**, kể cả `javascript:`,
`data:`, zero-width/RTL và HTML lồng ([ADR-0054](../adr/0054-safe-markdown.md)).

**43. DM riêng tư được đảm bảo ra sao?**

Quyền không suy từ `Member` mà từ bảng `DmParticipant`; người thứ ba nhận **404** trên mọi route
DM, kể cả URL tệp đính kèm, và không join được room. e2e 13/13 × 2 lần; DM không vào FTS/vector
nên không lộ qua search hay AI ([ADR-0070](../adr/0070-dm-and-user-blocks.md)).

**44. URL tệp có chữ ký và hạn dài thì có rủi ro chia sẻ không?**

Chữ ký chỉ là lớp một. Mỗi lần tải, server đọc lại quyền từ Postgres, nên rời server là mất quyền
ngay dù URL còn hạn (403). Hạn link là 24 giờ từ [ADR-0079](../adr/0079-tai-tep-dinh-kem-luoi.md)
(trước đó 60 giây) vì client tải lười, không hỏi lại link định kỳ; URL ràng buộc `userId` trong chữ
ký nên chia sẻ cho người khác vẫn bị chặn ở bước kiểm quyền.

**45. Nếu được hỏi "hệ thống này chịu được bao nhiêu người"?**

Tôi chỉ có số trên một laptop: 500 socket (3 instance) với 919.318 thông điệp/71,2 giây, p95
reconnect 3,14 giây; và 2.000 socket một instance ở v0.1.0 cho thấy điểm gãy. Trên production
(2026-11-14, `37ae8cb`, cùng mạng nhà với VPS) tôi đo được profile nhỏ: REST 10 vòng/giây
(30 request/giây, p95 1,28 giây, 0 lỗi) và 100 socket (0 lỗi join/gửi). Nấc 25 vòng/giây chạm
hạn mức 120 request/phút mỗi người; nấc 50 vòng/giây vượt p95 2 giây dù CPU VPS chỉ 23% — máy
bắn tải hết chỗ trước, nên tôi **không** tuyên bố trần của VPS hay SLA
([V9](evidence/V2-final/V9-load.md)).

## Điều tôi sẽ làm khác đi

1. **Đo trước, tối ưu sau — nhưng đo đúng đơn vị.** Bundle từng được báo 525,8 KB vì cộng mọi
   chunk; đổi sang "JS tải ban đầu" mới thấy 248,2 KB. Đơn vị sai làm quyết định sai.
2. **Viết test quyền theo route ngay khi tạo route**, không đợi đến lượt rà bảo mật: lỗ search
   `view Server` sống qua nhiều task vì guard "trông đúng".
3. **Tách worker khỏi tiến trình API ngay từ đầu** và có healthcheck riêng; sự cố "tệp đứng ở
   Đang kiểm tra" chỉ lộ ra khi demo, vì `pnpm dev` không chạy worker.
4. **Dùng một DB riêng cho demo/seed từ đầu.** DB dev tích 26 server làm trang chậm 6,6 giây vì
   429 — lỗi môi trường, không phải lỗi sản phẩm, nhưng làm mất thời gian và suýt thành kết luận
   sai.
5. **Ghi "chưa đo" sớm hơn.** Tôi từng viết README với câu "người ngoài nhận 404 chứ không phải
   403" — sai so với ADR-0028 và so với hành vi thật. Kỷ luật: mỗi câu khẳng định phải có lệnh
   chạy lại được.

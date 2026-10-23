# ADR-0048: Truy xuất vector có kiểm soát quyền (RAG)

Status: accepted  
Date: 2026-10-23

## Context

- T5.4 yêu cầu "truy xuất có kiểm soát quyền" trước khi đưa kết quả vào prompt: xác thực thành viên, lọc theo `serverId`, hydrate lại tin từ Postgres, loại tin đã xóa/ngoài quyền. Chỉ khi đó mới trả nội dung.
- Payload vector đã cố ý **không chứa nội dung tin nhắn** (ADR-0046): nguy cơ rò rỉ nếu Qdrant bị truy cập không đúng hoặc filter bị bỏ qua.
- Quyền hiện là server-wide (không có override channel); cache ability chỉ TTL 30 giây và dùng Redis (ADR-0026 fail-open) — user vừa bị kick vẫn có thể còn member trong cache.
- Một chunk hội thoại được embed cả cửa sổ tin liền kề; trả một phần chunk sẽ làm prompt lệch và có thể che giấu tin vừa bị xóa. Cần chính sách fail-closed rõ ràng.

## Decision

1. **Thứ tự bắt buộc**
   - (1) **Membership + quyền từ Postgres trước.** Dùng `AbilityFactory.contextForFresh`/`createForUserFresh` (bỏ qua cache Redis). Nếu không còn là member hoặc thiếu `VIEW_CHANNEL` -> `403`; không gọi embedder/vector store.
   - (2) **Lọc vector theo `serverId` (bắt buộc) và `channelId` (nếu có).** `VectorStore.search` thêm filter `serverId` trong Qdrant; `QdrantVectorStore` chỉ trả payload đã kiểm hình dạng và luôn đối chiếu lại `serverId`/`channelId`. Channel phải thuộc đúng server, nếu không -> `404` không làm lộ dữ liệu server khác.
   - (3) **Hydrate lại từ Postgres.** Chỉ `messageIds` từ payload được query qua `prisma.message` với `author/channel`. **Nội dung không bao giờ lấy từ Qdrant.**
   - (4) **Fail-closed theo chunk.** Một point chỉ được trả khi **toàn bộ** `messageIds` trong payload: hợp lệ (UUID), tồn tại, `deletedAt = null`, cùng `channelId` với payload, `channel.serverId = serverId`. Point có `id` != `messageIds` cuối hoặc payload hỏng/thiếu neo -> bỏ. Tin vừa xoá hoặc từ server/channel khác làm **cả chunk** bị loại thay vì trả một phần. Kết quả chỉ gồm tin đã hydrate thành công.

2. **Vector store**
   - Thêm `search(collection, vector, {serverId, channelId?, limit})` vào port `VectorStore`.
   - `QdrantVectorStore` gọi `/points/search` với `filter.must` `serverId` (+ `channelId`), `with_payload: true`, `with_vector: false`. Payload không tin cậy -> bỏ qua point sai hình dạng hoặc khác server. `vector` rỗng/lỗi hình dạng trả về lỗi `VectorStoreError` (tầng gọi quyết định suy giảm).
   - Collection vẫn theo naming hiện tại (ADR-0046); không thêm nội dung vào payload.

3. **Lớp dịch vụ**
   - `RetrievalService` (`modules/ai/retrieval`) triển khai thứ tự trên. Nhận `query` (trim, giới hạn độ dài), `limit` (1..50), `userId`, `serverId`, `channelId?`. Trả `RetrievedChunk[]` với `score` và `messages` đã hydrate (không có `deletedAt`). Cả `embedder.query` và `store.search` đều phải thành công; lỗi được truyền lên (không nuốt để "trả rỗng" che giấu sự cố — xem hậu quả).
   - Số ứng viên Qdrant = `limit * 3` (tối đa 150) để bù ứng viên bị loại bởi bước hydrate/fail-closed.

4. **Kiểm thử an toàn (bắt buộc)**
   - E2E `test/retrieval.e2e-spec.ts`: outsider/không member -> 403, không gọi store. User bị kick -> 403 dù `contextFor` đã cache. Thiếu `VIEW_CHANNEL` -> 403. Tin đã xoá trong chunk -> chunk bị loại hoàn toàn. Payload trỏ server/channel khác -> không rò rỉ nội dung. Payload hỏng/không đúng neo -> bỏ, không crash. Channel không thuộc server -> `404`. Chỉ channel được chỉ định mới được trả.

## Alternatives

- **Dựa hoàn toàn vào filter Qdrant.** Bị từ chối: Qdrant không xác thực membership hiện tại; payload có thể cũ/sai hình dạng; cần "hydrate lại từ Postgres" theo plan.
- **Lọc quyền sau hydrate bằng ability.can.** Không đủ: membership phải xác thực trước tìm kiếm (tránh gọi embedder/store thậm chí khi không còn member) và phải dùng fresh context (không cache Redis cho cổng này). Với mô hình server-wide hiện tại chưa cần `subject` per-channel nhưng kiến trúc vẫn giữ hydration check.
- **Trả một phần chunk khi một tin bị xóa.** Bị từ chối vì vector của chunk chứa ngữ cảnh tin đã xóa; trả một phần sẽ làm lệch prompt và khó chứng minh "không xuất hiện". Fail-closed theo chunk dễ kiểm chứng bằng test.

## Consequences

- **An toàn:** Chỉ tin còn tồn tại, đúng server/channel, và user còn quyền mới xuất hiện. Kick/role mất quyền không thể dùng window cache.
- **Hiệu năng:** Thêm 1 truy vấn Postgres để hydrate và 1 check membership fresh (bỏ cache). Vẫn chỉ 1 lần embed query; candidate limit x3.
- **Dữ liệu cũ:** Chunk có tin đã xoá trước khi re-embed sẽ bị loại tạm thời; indexer đã re-embed follower nhưng race window vẫn bị fail-closed (an toàn).
- **Tương thích:** Không đổi schema Qdrant/collection; chỉ thêm `search`. `VectorStore` interface mở rộng backward-compatible với adapter hiện tại cần cài `search`.
- **Suy giảm:** Nếu Qdrant/embedder lỗi, `RetrievalService` ném lỗi (không tự trả rỗng) để caller quyết định (T5.7). Service vẫn chặn trước khi tìm kiếm.
- **Giới hạn:** Không hỗ trợ channel override; nếu sau này thêm override phải thay đổi bước (3)-(4) dùng ability per-message/channel object.

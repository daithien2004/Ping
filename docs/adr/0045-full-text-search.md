# ADR-0045: Tìm kiếm tin nhắn trong server bằng FTS Postgres + trigram

Status: accepted — OWNER duyệt kèm kế hoạch T4.6 trong phiên ngày 2026-10-25
Date: 2026-10-25

## Context

Matrix tính năng (plan 1.5) đánh dấu thiếu "Tìm kiếm (FTS)" — [M]. Người dùng pilot cần tìm
lại tin nhắn cũ trong một server. Ràng buộc: kết quả phải tôn trọng quyền (chỉ member của
server đó), không trả tin đã xóa mềm, không lộ tin server khác; tiếng Việt có dấu nhưng người
dùng thường gõ không dấu; ngân sách 0 USD (không thêm dịch vụ tìm kiếm ngoài).

## Decision

1. **FTS trong chính Postgres** — cột sinh trên `Message`:
   `search tsvector GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent(content))) STORED`,
   index **GIN**. Không thêm hạ tầng tìm kiếm riêng (Elastic/Meilisearch) — một hệ phải vận
   hành thêm, sao lưu thêm, đồng bộ thêm; pilot chưa cần.
2. **`f_unaccent(text)` IMMUTABLE** (wrapper `unaccent('unaccent', $1)`): `unaccent()` gốc chỉ
   `stable` nên không dùng được trong generated column / index biểu thức — wrapper immutable là
   cách làm chuẩn của Postgres. Cấp extension `unaccent` + `pg_trgm` trong migration
   (`IF NOT EXISTS`).
3. **Cấu hình `simple`** (không tách từ tiếng Việt chuyên dụng): token theo khoảng trắng, bỏ
   dấu qua `f_unaccent` — "khong" khớp "không". Từ ghép tiếng Việt ("thư viện") sẽ không khớp
   khi gõ rời ("thu vien" khớp nhờ FTS 2 token; "vien" lẻ khớp nhờ trigram) — rủi ro ghi rõ.
4. **Trigram GIN trên `f_unaccent(content)`** (`gin_trgm_ops`) + truy vấn OR
   `f_unaccent(content) ILIKE '%q%'`: đường con-chuỗi cho từ con/từ ghép mà FTS simple không
   tách được; ngưỡng hiệu quả trigram ≥ 3 ký tự (truy vấn ngắn hơn chậm hơn — chấp nhận).
5. **Endpoint** `GET /servers/:serverId/search` sau guard `view Server` (member):
   `q` trim 1–200 (vượt → `SEARCH_QUERY_INVALID`), `channelId?`, `authorId?`, `since?` (ISO —
   filter thời gian cho UI), `before?`/`limit ≤ 50` (mặc định 25). `WHERE` luôn ràng buộc
   `channel.serverId = :serverId AND deletedAt IS NULL`. **Thứ tự mới nhất trước theo id +
   cursor `before`** (đúng quy ước cursor, không OFFSET) — không dùng `ts_rank` sắp xếp: rank
   cần keyset composite (rank, id) phức tạp hơn nhiều cho giá trị ít được để ý ở pilot; ghi
   trade-off.
6. **UI:** `SearchDialog` mở từ nút trên header kênh (không gắn vào Quick Switcher toàn cục —
   switcher không có bối cảnh server, endpoint lại theo server); bấm kết quả điều hướng
   `/channels/:id?m=<messageId>` dùng cơ chế nhảy-tới-tin sẵn có.
7. Đo p95 trên seed ~20.000 tin tiếng Việt (script riêng, createMany); số liệu trong evidence
   T4.6 và case study 4 sau này.

## Alternatives

- Hybrid vector (RRF với Qdrant) — T5.5, sau khi có embedding; T4.6 giữ FTS thuần cho ngữ
  nghĩa chính xác từ khoá.
- `ts_rank` xếp hạng + keyset composite — độ chính xác xếp hạng tốt hơn nhưng phân trang phức
  tạp và kém ổn định (rank đổi theo dữ liệu); pilot ưu tiên đơn giản.
- LIKE thường không index — không mở rộng được.
- Dịch vụ tìm kiếm ngoài — vượt ngân sách/ràng buộc vận hành.

## Consequences

- Thêm ~1 cột sinh + 2 index GIN trên bảng Message (dung lượng tăng; ghi chú viết nặng hơn) —
  đo lại ở T6.1.
- Migration ADD GENERATED với Postgres tính lại toàn bộ hàng hiện có — khoá bảng trong lúc
  chạy; ở dev dữ liệu nhỏ, production ghi trong runbook migrations.
- Kết quả tìm không phân biệt dấu; từ đơn lẻ trong từ ghép dựa vào trigram (chậm hơn một chút).
- `SEARCH_QUERY_INVALID` thêm vào `ErrorCodes`; `SEARCH_QUERY_MAX = 200` vào `Limits`.

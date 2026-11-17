# ADR-0103: Tìm kiếm lai (FTS + vector) bằng RRF trong endpoint tìm kiếm

Status: accepted (mới có unit test; chưa đo chất lượng và độ trễ trên dữ liệu thật)
Date: 2026-11-17

## Context

Thí nghiệm S3 (64 tin) cho thấy FTS khớp mã chính xác nhưng 0/8 truy vấn theo nghĩa, vector làm ngược lại, và RRF giữ cả hai. Hệ thống đã có chỉ mục vector
(chunk tin nhắn trong Qdrant, cho tính năng hỏi AI) cùng `RetrievalService` kiểm quyền fail-closed.

## Decision

1. `GET /servers/:serverId/search?mode=hybrid` (mặc định `keyword`, không đổi hành vi cũ). Hybrid chạy truy vấn từ khóa (ADR-0095) và `RetrievalService`
   song song, rồi gộp bằng `reciprocalRankFusion` (k=60). Hạng vector của mọi tin trong một chunk là hạng của chunk.
2. Quyền: kết quả vector đi qua `RetrievalService` (kiểm membership/quyền xem, hydrate từ Postgres); tên kênh chỉ lấy cho kênh thuộc server. Bộ lọc `authorId`,
   `since`, `channelId` áp dụng cho cả hai nguồn.
3. Vector hỏng (embedder hoặc Qdrant chết) thì rơi về kết quả từ khóa, không làm lỗi tìm kiếm.
4. Hybrid **không phân trang** (`hasMore=false`, bỏ qua `before`); giới hạn tối đa 50 kết quả đã gộp.

## Evidence

Unit test: RRF (đồng điểm giữ thứ tự xuất hiện), gộp hai nguồn đưa mục có ở cả hai lên đầu, vector hỏng thì trả kết quả từ khóa.

## Consequences

- Mỗi truy vấn hybrid tốn một lần embed (mô hình ONNX cục bộ) và một truy vấn Qdrant: độ trễ cao hơn tìm kiếm từ khóa, **chưa đo**.
- Chỉ mục vector theo chunk (cửa sổ vài tin), không theo từng tin như thí nghiệm S3, nên chất lượng khác thí nghiệm; chưa đánh giá.
- Chưa có nút chọn chế độ trong giao diện web.

# ADR-0044: Hồi phục khoảng trống tin nhắn khi reconnect (gap recovery)

Status: accepted — OWNER duyệt kèm kế hoạch T4.4 trong phiên ngày 2026-10-25
Date: 2026-10-25

## Context

Socket bị ngắt (mạng chập chờn, máy ngủ) trong khi người khác gửi tin. Realtime chỉ giao tin
at-least-once tới socket đang nối — tin gửi lúc offline mất event. Trước T4.4, cơ chế hồi phục
là `invalidateQueries` trên query tin nhắn ngay khi `channel.join` lại thành công: **tải lại
toàn bộ các trang đã mở** (mỗi trang 50 tin, người dùng có thể đã cuộn tải nhiều trang) chỉ để
lấy vài tin mới — tốn băng thông, và hợp đồng `before` chỉ biết đi về quá khứ nên không thể
đòi "chỉ phần thiếu".

## Decision

1. **API:** `GET /channels/:id/messages` nhận thêm cursor `after=<messageId>` (loại trừ với
   `before`): trả tin `id > after`, **thứ tự tăng dần**, envelope `MessagePage` cũ với
   `hasMore` = còn tin mới hơn; trần 100 tin/trang như `limit` hiện có; bỏ tin đã xóa mềm.
   Cursor `before` giữ nguyên ngữ nghĩa cũ (trang cũ hơn, mới nhất trước).
2. **Client không lưu `lastSeenId` riêng:** tail của cache kênh (tin mới nhất đã thấy) chính là
   cursor. Không có state phụ thứ hai cần đồng bộ; kênh chưa từng mở thì không có gì để vá —
   query đầu tiên khi mở là đầy đủ.
3. **Vá khoảng trống thay refetch:** khi `channel.join` thành công sau reconnect, nếu cache có
   tail → lặp `?after=` tới hết `hasMore`, upsert từng tin vào đúng chỗ (khớp id/nonce như cơ
   chế sẵn có — không trùng). Đủ và đúng thứ tự mà không tải lại lịch sử cũ.
4. **Dọn tin đã xóa lúc offline:** sau khi vá xong, tin nào trong cache có `id > afterId` mà
   không xuất hiện trong khoảng fetch về nghĩa là đã bị xóa mềm ở server → bỏ khỏi cache.
   Tin optimistic cục bộ (`temp-*`, trạng thái sending/failed) KHÔNG bao giờ bị bỏ — chúng
   chưa có ở server.
5. **Fallback an toàn:** cache trống, tail không xác định được, hoặc lỗi giữa chừng khi vá →
   `invalidateQueries` như hành vi trước T4.4. Việc vá là tối ưu, không phải nguồn sự thật.

## Alternatives

- Giữ refetch toàn bộ: đúng đắn (server là nguồn sự thật) nhưng tải lại N trang × 50 tin cho
  vài tin mới; với 10.000 tin đã cuộn thì tốn không chấp nhận được.
- Replay event từ server theo sequence (event sourcing): tổng quát hơn nhưng cần hạ tầng
  lưu trữ/ACK từng event cho từng client — quá mức cần cho pilot.
- Poll định kỳ `?after=`: đơn giản nhưng thêm tải nền liên tục; chỉ vá khi reconnect là đủ
  theo cấu hình phát hành.

## Consequences

- Hợp đồng API có hai chiều cursor (`before` về quá khứ, `after` về tương lai) — cần ghi rõ
  trong ADR này vì `docs/api-conventions.md` mô tả cursor một chiều; đổi thứ tự kết quả theo
  chiều cursor để việc vá tự nhiên.
- Hiệu chỉnh xóa/sửa trong khoảng trống chỉ xảy ra ở vùng `id > afterId`; tin cũ hơn đã xóa lúc
  offline không nằm trong phạm vi này (đa số là trang đã tải, refetch nền sẽ tự nhiên đối soát
  sau).
- Test hỗn loạn (rớt gói, đảo thứ tự, nonce trùng) thuộc T4.5, dựa trên nền này.

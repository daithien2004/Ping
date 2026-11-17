# S4 — shard theo serverId

**Câu hỏi:** chia dữ liệu theo `serverId` ra nhiều Postgres thì được gì và mất gì? Đây là đồ chơi để hiểu cái giá, không phải thiết kế
để đưa vào Ping.

**Cách đo:** `node experiments/s4-shard/run.mjs` tạo 4 CSDL `ping_s4_*` trong Postgres dev, định tuyến bằng băm `serverId`.
Kết quả thô: [result.json](result.json). Mọi shard cùng nằm trên **một** Postgres/máy, nên thông lượng là trần của máy chứ không phải
của kiến trúc.

## Kết quả

| Thử                                              | Kết quả                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Giao dịch tin nhắn + outbox trong một shard      | Vẫn nguyên vẹn (quy tắc 3 và 12 còn đúng trong shard)                                       |
| Ghi 40.000 tin, 16 luồng                         | 1 shard 6.910/s; 2 shard 10.070/s; 4 shard 10.501/s (bão hòa vì cùng một máy)               |
| "Tin mới nhất ở 24 server của tôi" p50           | 0,62 ms (1 shard) → 0,66 (2) → 0,99 (4); p95 0,95 → 0,88 → 1,46: phải hỏi mọi shard rồi gộp |
| `UNIQUE (username)`                              | Hỏng: `alice` tạo được ở hai shard                                                          |
| Xóa user ở hai shard, shard 2 lỗi                | Hỏng: shard 1 đã commit, shard 2 rollback, còn `[0,1]`, không có rollback chung             |
| Đổi số shard 2→3 / 3→4, tỉ lệ server phải chuyển | Băm chia dư 66,7% / 74,6%; jump hash 33,4% / 24,8%                                          |

## Kết luận

- Cái được: ghi song song theo shard (6.910 → ~10.000/s trước khi chạm trần máy) và mỗi giao dịch trong một server vẫn nguyên vẹn.
- Cái mất: truy vấn cắt ngang server tốn thêm một vòng hỏi mỗi shard; ràng buộc duy nhất toàn cục (email, username) và giao dịch
  xuyên shard biến mất, phải thay bằng thư mục toàn cục hoặc saga/outbox; đổi số shard với băm chia dư chuyển 2/3–3/4 dữ liệu,
  jump hash (hoặc bảng định tuyến) chuyển ~1/N.
- Với Ping: bảng 10 triệu tin vẫn trả lời trong vài ms ([báo cáo B5](../../docs/perf/2026-11-17-big-data.md)), nên chưa có lý do sharding.
  Nếu sau này phải làm, hướng ít đau nhất là tách riêng dữ liệu tin nhắn theo server và giữ `User`/`Session` ở một CSDL trung tâm.
- Giới hạn: một máy, một lần chạy, dữ liệu rỗng ngoài bảng thử; không đo resharding thật (chuyển dữ liệu) hay lỗi giữa chừng ngoài hai
  kịch bản trên.

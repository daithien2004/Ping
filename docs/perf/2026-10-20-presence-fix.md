# Đo lại bão kết nối lại sau khi sửa lỗi presence (2026-10-20)

Sửa: `handleConnection` không còn ngắt socket khi phát presence thất bại (xem
`2026-10-20-baseline.md`, điểm nghẽn 1). Cùng máy, cùng dữ liệu, 3 instance, kịch bản
`reconnect-storm.js -e SOCKETS=2000 -e ROUNDS=3 -e HOLD_S=15`.

| Số đo                               | Trước khi sửa | Sau khi sửa (hai lần chạy) |
| ----------------------------------- | ------------- | -------------------------- |
| Khôi phục p50                       | 6,2 giây      | 4,5 và 4,8 giây            |
| Khôi phục p95                       | **25,3 giây** | **8,6 và 10,4 giây**       |
| Khôi phục lớn nhất                  | 27,4 giây     | 12,0 và 12,1 giây          |
| Lần nối thất bại (kịch bản)         | 2.541         | 2.535 và 1.678             |
| Join thất bại                       | không tách    | 0                          |
| Log "connect setup failed" (server) | không có nhãn | 0                          |

Đọc kết quả:

- Thời gian khôi phục giảm khoảng 2,5–3 lần ở p95: socket không còn bị ngắt oan rồi phải nối lại lần nữa.
- Server vẫn ghi nhiều "presence update skipped" (1.785 dòng ở lần chạy đầu): pool Postgres vẫn cạn khi 2.000 người nối cùng lúc, nhưng giờ đó
  chỉ làm mất một thông báo presence thay vì mất cả kết nối.
- Còn khoảng 1.700–2.500 lần "socket không mở được" mà server không log lỗi nào. Chưa rõ nguyên nhân (nghi backlog
  chấp nhận kết nối hoặc event loop bão hòa trên máy đo); được theo dõi trong [nợ kỹ thuật](../tech-debt.md). Kịch bản đã tách
  `connect_failed` và `join_failed` để lần sau thấy rõ.
- Mỗi cấu hình đo hai lần, chưa đủ để có khoảng tin cậy; đây là laptop (xem báo cáo baseline).

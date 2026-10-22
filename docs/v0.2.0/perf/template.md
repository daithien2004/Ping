# `<ngày>` — `<task/profile/môi trường>`

Trạng thái: bản mẫu, chưa đo.

- Commit/image, nhánh:
- Máy phát tải và máy đích: CPU/RAM/OS, vị trí mạng/proxy:
- Profile/script, seed/dữ liệu demo, số instance, pool và cấu hình:
- Rate limit bật/tắt, lý do và tác động:
- Lệnh, thời lượng, warm-up, ngày/múi giờ:

| Chỉ số             | Trước   | Sau     | Mục tiêu      | Raw evidence |
| ------------------ | ------- | ------- | ------------- | ------------ |
| REST p95           | Chưa đo | Chưa đo | Theo ADR-0038 | Chưa có      |
| Fan-out p95/lỗi    | Chưa đo | Chưa đo | Theo ADR-0038 | Chưa có      |
| Reconnect/loại lỗi | Chưa đo | Chưa đo | Theo ADR-0038 | Chưa có      |

## Kết luận và giới hạn

Điều quan sát, giả thuyết nút cổ chai, cách kiểm giả thuyết, giới hạn generator/thời lượng và
những tải chưa đo. Nêu điều kiện trước/sau có tương đương không; không tự suy sức tải production.

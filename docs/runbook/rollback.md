# Rollback

Rollback = chạy lại **phiên bản code trước**. Không có migration "down": an toàn nhờ quy tắc expand/contract
(CLAUDE.md, 13): schema của bản mới vẫn phải tương thích với code của bản liền trước.

> Đã kiểm chứng: tắt êm khi nhận SIGTERM trong container (thoát mã 0). Các bước triển khai lại image cũ là nguyên tắc
> cho stack compose mẫu, chưa diễn tập trên môi trường thật.

## Khi nào quay lại, khi nào sửa tiếp

- Tỉ lệ 5xx tăng ngay sau deploy (cảnh báo `PingHighErrorRate`) hoặc `/ready` không lên: **quay lại trước, điều tra sau**.
- Lỗi chỉ ảnh hưởng một tính năng nhỏ, có cách sửa nhanh: sửa tiếp có thể rẻ hơn.

## Các bước

1. **Dừng đà**: nếu đang rollout dần, dừng rollout.
2. **Xác định phiên bản trước.** Image được gắn tag theo commit/version; lấy tag của bản chạy tốt gần nhất (lịch sử
   deploy, hoặc `git log` của nhánh `main`).
3. **Có migration đi kèm bản lỗi không?**
   - Chỉ _expand_ (thêm cột/bảng/index, có mặc định hoặc cho NULL): **không cần làm gì với DB**, code cũ chạy bình thường.
   - Có bước _contract_ (xóa/đổi tên cột) trong bản lỗi: code cũ có thể hỏng. Khôi phục từ sao lưu **trước migration**
     là phương án cuối ([backup-restore.md](backup-restore.md)); mất dữ liệu ghi sau thời điểm đó. Đây là lý do contract
     phải để rất muộn và tách riêng.
4. **Triển khai lại image cũ**, với stack compose:

   ```bash
   # sửa tag image trong file compose/biến môi trường về bản trước, rồi:
   docker compose -p <project> -f docker-compose.prod.example.yml --env-file .env.prod up -d api web
   ```

   Không chạy lại service `migrate` khi quay về bản cũ (không cần, và `migrate deploy` chỉ áp migration còn thiếu).

5. **Tắt êm:** API nhận SIGTERM sẽ trả `/ready` 503, chờ `SHUTDOWN_GRACE_MS` cho load balancer loại instance, rồi đóng
   (đã thử: thoát mã 0, ADR-0032). Client đang mở sẽ nối lại sang instance mới.
6. **Kiểm tra sau rollback:** `/api/v1/ready` 200, 5xx về bình thường, đăng nhập và gửi một tin thử.
7. **Ghi lại:** nguyên nhân gốc, vì sao CI/test không bắt được, và thêm test ngăn tái diễn.

## Lưu ý về web

`NEXT_PUBLIC_API_URL` được nướng vào bundle lúc build. Rollback web là triển khai lại **image web cũ** (đã nướng giá trị
đúng của nó), không phải đổi biến môi trường lúc chạy.

## Chưa làm

Chưa có quy trình triển khai/rollback tự động cho nơi chạy cụ thể (viết cùng `deploy.md` trước `v0.1.0`). Các bước trên
là nguyên tắc và lệnh cho stack compose mẫu.

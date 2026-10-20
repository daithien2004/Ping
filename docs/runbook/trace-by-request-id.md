# Tra lỗi bằng `requestId`

Mỗi lỗi mà người dùng thấy đều có một mã tham chiếu (UUID). Mã đó là **cùng một giá trị** ở nhiều nơi, nên từ mã này tra
ra toàn bộ câu chuyện của request.

| Nơi              | Ở đâu                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Giao diện        | dòng "Mã lỗi: …" trên trang lỗi, và trong thông báo lỗi 5xx                      |
| Response API     | body `{ code, message, requestId }` và header `X-Request-Id`                     |
| Log của API      | mọi dòng log của request đều có trường `requestId` (JSON, pino)                  |
| Bảng `AuditLog`  | cột `requestId` của hành động nhạy cảm (đổi role, kick, xóa tin của người khác)  |
| Sentry (nếu bật) | tag `requestId` trên lỗi 500 bất ngờ (chỉ bug, không gửi 4xx hay 503 do hạ tầng) |

Lỗi ở phía trình duyệt (không qua API) thì mã là `digest` của Next, có trong Sentry của web nếu bật.

## Các bước

1. **Lấy mã** từ người dùng (ảnh chụp màn hình trang lỗi là đủ).
2. **Tìm log của request.** Log là JSON mỗi dòng, ghi ra stdout của tiến trình API:

   ```bash
   # stack docker compose (project pingprod hoặc tên bạn đặt)
   docker compose -p pingprod logs api | grep '<requestId>'

   # đọc dễ hơn, nếu có jq (bỏ các dòng không phải JSON)
   docker compose -p pingprod logs --no-log-prefix api | grep '<requestId>' | jq -r '[.time, .level, .msg, .status, .code] | @tsv'
   ```

   `level` 50 là error, 40 warn, 30 info. Bạn thấy: dòng "request completed" hoặc "request errored" của pino-http
   (phương thức, đường dẫn, mã trạng thái, thời gian), và các dòng của service bên trong request (đều mang cùng
   `requestId` vì nestjs-pino gắn logger theo từng request).

3. **Đọc nguyên nhân.**
   - `"msg":"unhandled exception"` kèm `stack`: bug trong code, có stack để xem chỗ ném.
   - `"msg":"server error"` kèm `dependency`: hạ tầng (ví dụ `postgres`): xem [failure-modes.md](failure-modes.md).
   - `"msg":"request rejected"` (warn): lỗi 4xx hợp lệ do client, xem `code` (mã trong `ErrorCodes`).
4. **Mở lỗi trên Sentry** bằng tag: tìm `requestId:<mã>`; có stack, URL (đã bỏ query) và user id.
5. **Muốn biết ai là người dùng?** Lỗi 500 trên Sentry có user id; với hành động nhạy cảm, tra `AuditLog` theo `requestId`.

## Không có log?

- API chạy bằng `NODE_ENV=production` vẫn log mức `info`; nếu bạn gom log vào nơi khác (Loki, ELK…) thì tìm ở đó
  với cùng điều kiện `requestId`.
- Nếu `requestId` là `unknown`: request bị từ chối trước khi vào middleware gán id (hiện không còn: `assignRequestId`
  chạy đầu tiên). Nếu vẫn gặp, đó là bug, ghi lại.
- Mã không có trên giao diện (ví dụ lỗi mạng khiến không nhận được response): không có `requestId`; tìm theo thời
  điểm và đường dẫn trong log.

## Kiểm tra toàn tuyến ở staging

Gây một lỗi 500 có chủ đích, lấy mã lỗi từ giao diện, tìm ra log của request và lỗi tương ứng trên Sentry. Test
`apps/api/test/error-tracking.e2e-spec.ts` đã chứng minh mã ở response, header và báo cáo Sentry là một id; phần
còn lại (log gom, Sentry thật) chỉ kiểm được trên môi trường thật.

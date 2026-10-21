# Proxy Nginx của Ping

Stack mẫu dùng Nginx 1.30.6 (ADR-0035): `/api/*` và `/socket.io/*` tới API, đường dẫn khác tới web.
Không cần cài Nginx trên Windows; Docker chạy nó trong container.

## Đọc cấu hình theo luồng request

1. `nginx.conf` khai báo hai upstream `ping_web` và `ping_api`. `resolver` dùng DNS Docker;
   `resolve` cập nhật IP khi container thay đổi để không phải restart proxy cùng API.
2. `http.conf.template` mở HTTP; compose TLS thay nó bằng `tls.conf.template` để mở HTTPS và
   chuyển HTTP sang `PUBLIC_URL`. Image chỉ thay biến `PUBLIC_URL`, giữ các biến `$http_host`,
   `$request_uri` của Nginx. `PUBLIC_URL` là origin, không có đường dẫn hoặc dấu `/` cuối.
3. `routes.conf` chọn upstream theo đường dẫn. `proxy_pass` không có dấu `/` cuối nên không cắt
   `/api/v1`. WebSocket cần gửi rõ header `Upgrade` và `Connection`; request HTTP thường không cần.
4. `Host` giữ cả port, giao thức lấy từ `$scheme`, IP lấy từ kết nối thật. Các header forwarded
   do client gửi bị ghi đè vì API chỉ tin một proxy (`TRUST_PROXY=1`).
5. Tắt buffering response để Next có thể stream; tắt buffering request để API sớm áp giới hạn
   body 32 KB. API trả lỗi JSON có `requestId`, thay vì Nginx trả trang HTML cho request 40 KB.
6. Log proxy chỉ ghi method, status và mã tham chiếu (ưu tiên `X-Request-Id` từ API), không ghi URL,
   query, cookie hoặc body. HTTPS đọc khóa/chứng chỉ được mount read-only từ ngoài repo.

## Local HTTP

Sao chép `.env.prod.example` thành `.env.prod`, thay mật khẩu và JWT secret. Giữ
`PUBLIC_URL=http://localhost:8080`, `BIND_ADDRESS=127.0.0.1`, `HTTP_PORT=8080`.

```sh
docker compose -p pingprod -f docker-compose.prod.example.yml --env-file .env.prod up -d --build --wait
docker compose -p pingprod -f docker-compose.prod.example.yml --env-file .env.prod exec -T nginx nginx -t
node apps/api/test/smoke/prod-stack.mjs
```

Mở `http://localhost:8080`. HTTP này chỉ để thử trên loopback; ứng dụng vẫn đặt cookie production
`Secure`. Kiểm thử cookie thực tế nên dùng HTTPS dưới đây. Smoke Node gửi cookie trực tiếp để kiểm
proxy và CSRF, không thay thế kiểm tra hành vi cookie của trình duyệt.

Luôn dùng project `pingprod` để tách dữ liệu khỏi compose dev `ping`. Không chạy `down -v` nếu muốn
giữ dữ liệu. Chuyển từ stack Caddy cũ: dừng stack cũ bằng compose cũ trước khi checkout cấu hình mới;
giữ volume Postgres, không cần xóa volume chứng chỉ Caddy để chuyển đổi.

## HTTPS với chứng chỉ có sẵn

Cần Docker Compose >= 2.24.4. Chuẩn bị thư mục **ngoài repository** có `fullchain.pem` và `privkey.pem`,
giới hạn quyền đọc khóa riêng. Với local, chứng chỉ phải có SAN `localhost` và CA được trình duyệt tin.
Không commit khóa hoặc chứng chỉ thử vào repository.

Sửa `.env.prod`:

```dotenv
PUBLIC_URL=https://localhost:8443
BIND_ADDRESS=127.0.0.1
HTTP_PORT=8080
HTTPS_PORT=8443
TLS_CERT_DIR=C:/absolute/path/to/certs
```

```sh
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod up -d --build --wait
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod exec -T nginx nginx -t
```

Mở `https://localhost:8443`; HTTP chuyển 308 sang origin HTTPS đã cấu hình. Đổi `PUBLIC_URL` cần build
lại web vì URL API và CSP được ghi vào bundle lúc build.

Smoke HTTPS (PowerShell, CA thật hoặc CA thử được tin, không tắt kiểm tra TLS):

```powershell
$env:BASE_URL = 'https://localhost:8443'
$env:HTTP_URL = 'http://localhost:8080'
$env:NODE_EXTRA_CA_CERTS = 'C:/absolute/path/to/certs/fullchain.pem'
node apps/api/test/smoke/prod-stack.mjs
```

`NODE_EXTRA_CA_CERTS` chỉ dành cho CA thử; không đặt thành chứng chỉ leaf nếu sử dụng chuỗi chứng chỉ
công khai bình thường. Sau kiểm tra, xóa các biến khỏi phiên shell nếu chuyển về kiểm HTTP.

## Khi có domain thật

Đặt `PUBLIC_URL=https://ping.example.com`, `BIND_ADDRESS=0.0.0.0`, `HTTP_PORT=80`, `HTTPS_PORT=443` và
`TLS_CERT_DIR` tương ứng. Phải có chứng chỉ hợp lệ trước khi chạy compose TLS. Nginx không tự xin hoặc
gia hạn chứng chỉ: hệ thống cấp chứng chỉ bên ngoài cần gia hạn file rồi chạy:

```sh
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod exec -T nginx nginx -t
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod exec -T nginx nginx -s reload
```

Quản lý domain, ACME, tự động gia hạn, registry, backup và firewall thuộc pha staging; hướng dẫn này
chưa chứng minh đã triển khai trên cloud. Không đặt thêm proxy phía trước mà chưa xem lại
`TRUST_PROXY` và các header IP/giao thức.

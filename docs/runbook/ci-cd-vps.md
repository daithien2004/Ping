# CI/CD triển khai VPS qua GHCR

Workflow `.github/workflows/publish-deploy.yml` đợi CI thành công trên `main`, build ba image (`ping-api`, `ping-migrate`, `ping-web`) và đẩy lên GHCR theo tag SHA commit. Sau đó workflow dùng SSH key bị giới hạn lệnh để gửi Compose/Nginx config, cấp token GHCR ngắn hạn qua stdin, rồi VPS pull image, chạy migration, cập nhật stack và chờ healthcheck. `.env.prod` được sinh một lần trên VPS khi bootstrap; deploy không gửi bí mật runtime từ GitHub.

## Cấu hình GitHub

Tạo GitHub Environment tên `production`. Giới hạn deployment branch là `main`; bật reviewer bắt buộc nếu gói GitHub của repo hỗ trợ. Thêm các **Environment secrets** sau:

| Secret            | Giá trị                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `VPS_HOST`        | IP hoặc hostname VPS, không kèm user/port                               |
| `VPS_SSH_KEY`     | SSH private key; public key tương ứng được cài cho user `deploy`        |
| `VPS_KNOWN_HOSTS` | Host key đã xác minh độc lập, theo dạng `host ssh-ed25519 <public-key>` |

Tạo repository variables `PRODUCTION_ENVIRONMENT=production`, `PRODUCTION_URL=https://20.193.75.48` và `VPS_DEPLOY_ENABLED=true`. `PRODUCTION_URL` phải giống `PUBLIC_URL` trong `.env.prod` trên VPS và được nhúng vào web lúc build. Có thể thêm variable `NEXT_PUBLIC_SENTRY_DSN` nếu dùng Sentry trên web. GitHub Actions dùng `GITHUB_TOKEN` với quyền `packages:read` để VPS pull image; không cần PAT GHCR dài hạn.

Các runtime secrets không nằm trong GitHub. `deploy/bootstrap.sh` tạo `/opt/ping/.env.prod` với quyền `0600`, gồm mật khẩu Postgres và JWT ngẫu nhiên. File này là nguồn cấu hình runtime; chỉnh trực tiếp trên VPS qua SSH khi cần thay đổi.

```dotenv
PUBLIC_URL=https://20.193.75.48
GHCR_OWNER=<github-owner-chu-thuong>
TLS_CERT_DIR=/opt/ping/tls
TLS_CERT_HOST=20.193.75.48
BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
POSTGRES_PASSWORD=<bootstrap-tu-sinh>
JWT_ACCESS_SECRET=<bootstrap-tu-sinh>
```

Có thể bổ sung `SENTRY_DSN`, `ATTACHMENT_USER_QUOTA_BYTES` và `ATTACHMENT_SERVER_QUOTA_BYTES`. `images.env` giữ tag image hiện tại, do deploy script cập nhật.

## Chuẩn bị VPS lần đầu

1. Mở cổng 22, 80, 443 trong firewall của nhà cung cấp. Hiện HTTPS dùng trực tiếp IP `20.193.75.48`, chưa cần DNS; bootstrap hỗ trợ Ubuntu/Debian.
2. Trên Windows, tạo SSH key riêng cho GitHub Actions:

   ```powershell
   ssh-keygen -t ed25519 -C ping-ci -f "$env:USERPROFILE\.ssh\ping-ci"
   ```

3. Trong PowerShell ở thư mục repo, đặt username SSH và đường dẫn file `.pem` nhà cung cấp đã cấp. File `.pem` chỉ dùng để bạn quản trị VPS, không đưa vào GitHub:

   ```powershell
   $vpsUser = 'azureuser'
   $vpsHost = '20.193.75.48'
   $vpsPem = 'D:\path\to\Ping_key.pem'
   $vpsTarget = "$vpsUser@$vpsHost"
   ssh -i $vpsPem $vpsTarget "mkdir -p /tmp/ping-bootstrap"
   scp -i $vpsPem -r deploy docker-compose.prod.example.yml docker-compose.prod.tls.yml "${vpsTarget}:/tmp/ping-bootstrap/"
   scp -i $vpsPem "$env:USERPROFILE\.ssh\ping-ci.pub" "${vpsTarget}:/tmp/ping-bootstrap/"
   ssh -i $vpsPem -t $vpsTarget
   ```

   Trên VPS:

   ```bash
   sudo -i
   export CI_PUBLIC_KEY="$(cat /tmp/ping-bootstrap/ping-ci.pub)"
   export PUBLIC_URL='https://20.193.75.48'
   export GHCR_OWNER='<github-owner-chữ-thường>'
   export TLS_CERT_HOST='20.193.75.48'
   bash /tmp/ping-bootstrap/deploy/bootstrap.sh
   ```

   Script cài Docker/Compose và Certbot, tạo user `deploy` chỉ nhận lệnh SSH giới hạn, sinh `/opt/ping/.env.prod`, cài backup hằng ngày và hooks gia hạn TLS. Sau bước này VPS không cần source code.

4. Tạo chứng chỉ lần đầu bằng Certbot standalone khi cổng 80 còn trống:

   ```bash
   sudo certbot certonly --standalone --preferred-profile shortlived --ip-address 20.193.75.48 --agree-tos -m email-cua-ban@example.com --non-interactive
   sudo /usr/local/bin/ping-cert-sync
   ```

   Lệnh sync chép riêng chứng chỉ Ping vào `/opt/ping/tls`. Bootstrap cài Certbot hooks: dừng Nginx khi Certbot cần cổng 80, chép chứng chỉ mới sau khi gia hạn, rồi khởi động và reload proxy. Chứng chỉ IP có hạn 160 giờ; không tắt timer `snap.certbot.renew.timer`.

5. Thêm GitHub Environment secrets: `VPS_HOST`, `VPS_SSH_KEY` (nội dung file private key `ping-ci`) và `VPS_KNOWN_HOSTS`. Lấy host key từ dòng bootstrap `Verified SSH host key`, thêm `<VPS_HOST>` vào đầu dòng đó. Xác minh key qua console/kênh tin cậy trước khi lưu.

6. Tạo repository variables `PRODUCTION_ENVIRONMENT=production`, `PRODUCTION_URL=https://20.193.75.48` và `VPS_DEPLOY_ENABLED=true`. Bật Environment `production` cho nhánh `main`, rồi merge vào `main`. CI chạy trước; workflow **Publish and deploy** chỉ publish/deploy khi CI thành công.

Compose giữ Postgres, Redis, Qdrant và uploads trong named volumes. Không chạy `docker compose down -v`; lệnh đó xóa dữ liệu. Backup hằng ngày nằm trong `/opt/ping/backups`, giữ 14 ngày; hãy sao chép bản backup hoặc snapshot VPS ra ngoài máy trước khi dùng dữ liệu thật.

## Mỗi lần phát hành

Push/merge vào `main` → CI → build/push image SHA → gửi cấu hình qua forced SSH command → đăng nhập GHCR bằng `GITHUB_TOKEN` tạm thời → pull → migration → Compose healthchecks. Deploy script khóa lần chạy đồng thời, giữ SHA hiện tại trong `images.env` và tự quay lại tag trước nếu rollout không khỏe. Web cần build lại nếu đổi `PRODUCTION_URL` hoặc `NEXT_PUBLIC_SENTRY_DSN`.

Rollback thủ công: GitHub Actions → **Publish and deploy** → Run workflow trên `main` → nhập SHA commit cũ đã có image trên GHCR. Chỉ rollback code khi schema hiện tại còn tương thích; không rollback dữ liệu bằng cách xóa volume.

Theo dõi trạng thái trên GitHub Actions. Trên VPS, xem log bằng:

```bash
cd /opt/ping
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod --env-file images.env ps
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod --env-file images.env logs --tail 100 api worker nginx migrate
./deploy/backup.sh
```

Secrets runtime ở `.env.prod` trên VPS, không được gửi qua workflow và không nên commit. Quyền SSH deploy chỉ nhận `config`, `deploy` và `status`; nó không cấp shell tương tác. Backup script giữ Postgres và uploads ở cùng VPS, nên cần bản sao offsite riêng.

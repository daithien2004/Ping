# HTTPS trực tiếp trên IP VPS

Flow này dùng Nginx hiện tại với chứng chỉ IP của Let's Encrypt cho `20.193.75.48`. Chứng chỉ IP có thời hạn 160 giờ (khoảng 6 ngày), vì vậy Certbot phải tự gia hạn và Nginx phải nạp lại chứng chỉ sau mỗi lần gia hạn.

## Cấu hình ban đầu

Trong GitHub repository variables, đặt:

```text
PRODUCTION_URL=https://20.193.75.48
PRODUCTION_ENVIRONMENT=production
VPS_DEPLOY_ENABLED=true
```

Khi chạy bootstrap trên VPS, đặt:

```bash
export PUBLIC_URL='https://20.193.75.48'
export TLS_CERT_HOST='20.193.75.48'
```

Bootstrap cài Docker, Certbot từ Snap (5.4 trở lên), tạo `/opt/ping/.env.prod` và cài hook gia hạn. Mở TCP `22`, `80`, `443` trong firewall VPS. Tạo chứng chỉ ban đầu:

```bash
sudo certbot certonly --standalone --preferred-profile shortlived \
  --ip-address 20.193.75.48 --agree-tos -m you@example.com --non-interactive
sudo /usr/local/bin/ping-cert-sync
```

Sau đó workflow deploy sẽ chạy Nginx với HTTPS. Không tắt `snap.certbot.renew.timer`; các hook dừng Nginx cho thử thách HTTP, đồng bộ chứng chỉ mới, khởi động và reload Nginx.

## Chuyển sang domain sau này

1. Tạo DNS `A` record trỏ domain về `20.193.75.48`.
2. Trong `/opt/ping/.env.prod`, đổi `PUBLIC_URL` thành `https://api.example.com` và `TLS_CERT_HOST=api.example.com`.
3. Xin chứng chỉ domain: `sudo certbot certonly --standalone -d api.example.com --agree-tos -m you@example.com --non-interactive`.
4. Chạy `sudo /usr/local/bin/ping-cert-sync`, rồi kiểm tra và reload Nginx:

   ```bash
   cd /opt/ping
   docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
     --env-file .env.prod --env-file images.env exec -T nginx nginx -t
   docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
     --env-file .env.prod --env-file images.env exec -T nginx nginx -s reload
   ```

5. Đổi GitHub variable `PRODUCTION_URL` sang domain và chạy deploy để build web với origin mới.
6. Sau khi xác nhận HTTPS domain hoạt động, xóa chứng chỉ IP cũ: `sudo certbot delete --cert-name 20.193.75.48`.

Certbot tự lưu cấu hình gia hạn cho domain mới. CI/CD và image registry không cần thay đổi.

# V2 — HTTPS và gia hạn tự động (2026-11-14)

Máy kiểm: Windows, SSH `azureuser@20.193.75.48` bằng khóa riêng (chỉ dùng để kiểm, không đưa vào
repo). Bản chạy: `37ae8cb` (khớp [deploy.md](deploy.md)). Mốc thời gian ghi theo giờ VPS (+07)
kèm UTC khi cần; certificate dùng UTC.

## 1. Trạng thái hiện tại (chỉ đọc)

| Mục              | Giá trị                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| URL              | `https://20.193.75.48` — Nginx container `pingprod-nginx-1`, trả `HTTP/1.1 200 OK`              |
| Timer gia hạn    | `snap.certbot.renew.timer` **active**; lần chạy gần nhất 2026-11-14 10:26:27 +07, kế tiếp 19:25 |
| Certificate name | `20.193.75.48` (ECDSA, profile `shortlived`)                                                    |
| Identifiers      | `20.193.75.48` (chứng chỉ IP, không phải domain)                                                |
| Hiệu lực         | `notBefore` 2026-11-11 21:55:30Z → `notAfter` 2026-11-18 13:55:29Z (còn 4 ngày lúc kiểm)        |
| Issuer           | Let's Encrypt `YE2`                                                                             |
| Authenticator    | `standalone` (cần cổng 80; hook dừng Nginx trong lúc thử thách)                                 |
| Hook             | pre `40-ping-stop-nginx`, post `40-ping-start-nginx`, deploy `40-ping-sync-cert`                |

Chứng chỉ IP sống khoảng 6 ngày, nên mốc `notBefore` 11/11 chứng minh đã có ít nhất một lần gia
hạn sau lần cấp đầu (2026-11-05).

## 2. Bằng chứng gia hạn tự động đã xảy ra

`/var/log/letsencrypt/letsencrypt.log.6`:

```text
2026-11-12 05:51:23 INFO  Certificate is due for renewal, auto-renewing...
2026-11-12 05:53:55 DEBUG Notifying user: Renewing an existing certificate for 20.193.75.48
2026-11-12 05:54:03 DEBUG Notifying user: Congratulations, all renewals succeeded:
```

Các lần quét sau đó đều bỏ qua vì chưa tới hạn — `letsencrypt.log.2` (2026-11-14 03:02) và
`letsencrypt.log.1` (2026-11-14 10:26):

```text
Notifying user: Certificate not yet due for renewal
Notifying user:   /etc/letsencrypt/live/20.193.75.48/fullchain.pem expires on 2026-11-18 (skipped)
```

`journalctl -u snap.certbot.renew.service` cho thấy các lần chạy đều `Finished` (không có lần lỗi)
kể từ 2026-11-08; lần 2026-11-12 05:51–05:54 kéo dài ~2 phút 45 giây (đúng lần cấp lại), các lần
khác 1–3 giây.

## 3. Dry run

Chạy 2026-11-14 12:57:30 → 13:01:20 +07 (03:57–04:01 UTC), `sudo certbot renew --dry-run`:

```text
Certificate not due for renewal, but simulating renewal for dry run
Dry run: skipping updating lineage at /etc/letsencrypt/live/20.193.75.48
Dry run: skipping deploy hook command: /etc/letsencrypt/renewal-hooks/deploy/40-ping-sync-cert
Congratulations, all simulated renewals succeeded:
```

- Pre-hook dừng `nginx`, post-hook chạy `up -d --wait nginx` rồi `nginx -t` và `nginx -s reload`.
  Trong dry run, deploy hook (chép chứng chỉ vào `/opt/ping/tls`) bị Certbot bỏ qua — đúng, vì
  không có chứng chỉ mới.
- **Gián đoạn quan sát được:** Nginx tắt trong lúc thử thách HTTP vài giây; tổng thời gian lệnh
  ~3 phút 50 giây, phần lớn là `up -d --wait` (kéo theo các dependency web/api/db). Trong lần gia
  hạn thật, cùng chuỗi này chạy.
- Ngay sau lệnh: `curl -skI https://20.193.75.48` → **200 OK** (kiểm trên VPS và từ máy OWNER).
  Certificate không đổi (`notAfter` vẫn 2026-11-18) — dry run không ghi đè lineage.

## 4. Cảnh báo hết hạn — giới hạn

`ops/alerts.yml` có 7 rule (`PingHighErrorRate`, `PingPostgresDown`, `PingRedisDown`,
`PingSocketDropSpike`, `PingInstanceDown`, `PingAiBudgetWarning`, `PingAiBudgetMetricsUnavailable`);
**không có rule nào theo dõi hạn chứng chỉ TLS**, và [alerts.md](../../../runbook/alerts.md) cũng
không có mục tương ứng. Prometheus/Alertmanager thậm chí chưa được dựng trên production.

Giới hạn ghi nhận: nếu certbot ngừng chạy hoặc Nginx không nạp lại được chứng chỉ, không có cảnh
báo chủ động; chỉ phát hiện khi trình duyệt/`curl` báo lỗi TLS. Theo kế hoạch, không thêm workflow
mới ở bước này — tín hiệu hiện có là `snap.certbot.renew.timer` + log
`/var/log/letsencrypt/letsencrypt.log*` và lệnh `sudo certbot certificates`.

## 5. Chạy lại

```bash
systemctl list-timers snap.certbot.renew.timer
sudo certbot certificates
sudo certbot renew --dry-run
curl -skI https://20.193.75.48
```

**Kết luận:** HTTPS hoạt động, gia hạn tự động **đạt** (đã gia hạn thật ngày 12/11, dry run xanh);
giám sát hạn chứng chỉ **chưa có** — ghi là giới hạn, không phải lỗi của bước này.

# V5 — sao lưu mã hóa ngoài VPS và khôi phục (2026-11-14)

Bản chạy production `37ae8cb`; backup chụp lúc **2026-11-14T06:12:46Z** (13:12 +07), tệp
`postgres-20261114T061246Z` và `uploads-20261114T061246Z`. Người dùng giải mã `.age` bằng khóa
riêng trên máy cá nhân; khóa không đi qua agent và không nằm trong repo. Lần khôi phục thực hiện
lúc **14:05–14:08 +07** trên máy Windows, Postgres 17 Docker local.

## 1. Tệp sao lưu và mã hóa

Cron `/etc/cron.d/ping-backup` chạy hằng ngày 02:30 UTC bằng user `deploy`; `deploy/backup.sh`
dump Postgres `-Fc`, tar volume `pingprod_uploads`, rồi mã hóa cả hai bằng age với recipient
`/opt/ping/backup-recipient.txt` (chỉ chứa khóa công khai). Giữ 14 ngày tại
`/opt/ping/backups`; bản `.age` là bản duy nhất rời VPS.

| Tệp                                   | Kích thước | SHA-256                                                            |
| ------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `postgres-20261114T061246Z.dump.age`  | 122.663 B  | `bed86e022a40f42708c03cdc9b2624e9e4a2cfb0066310db5b3e0bedca3c73e5` |
| `uploads-20261114T061246Z.tar.gz.age` | 85.022 B   | `400e7651d84f0996541b3710c666995c65f1b31de5b14bc4c93c3fade253e0e2` |
| `postgres-20261114T061246Z.dump`      | 122.447 B  | `4cd0bed70febd4dddac263bbb74e715a54f36bdc5a90649c1c68ded127dcd5d0` |
| `uploads-20261114T061246Z.tar.gz`     | 84.806 B   | `d6645ed3ec5fb1ba0709e06833f9c4a71a169b208077b9d6b9409c803fe08cd6` |

`scripts/pull-backup.ps1` kéo các tệp `.age` về `D:\ping-backups`, không tải lại tệp đã có, giữ 7
bản mới nhất. Giải mã (chạy trên máy OWNER, không đưa khóa vào shell history dùng chung):

```powershell
age -d -i C:\Users\<user>\age-key.txt -o postgres-<stamp>.dump postgres-<stamp>.dump.age
age -d -i C:\Users\<user>\age-key.txt -o uploads-<stamp>.tar.gz uploads-<stamp>.tar.gz.age
```

## 2. Khôi phục Postgres (CSDL mới)

```bash
docker exec ping-postgres-1 psql -U ping -d postgres -c "CREATE DATABASE ping_restore"
docker exec -i ping-postgres-1 pg_restore -U ping -d ping_restore --no-owner --exit-on-error \
  < postgres-20261114T061246Z.dump
```

Lần chạy lại để đo: **1.121 ms** từ `CREATE DATABASE` tới `pg_restore` xong, không lỗi. Số hàng:

| Bảng                 | Bản khôi phục | Production hiện tại | Kết luận                          |
| -------------------- | ------------- | ------------------- | --------------------------------- |
| `User`               | 8             | 8                   | khớp                              |
| `Server`             | 3             | 3                   | khớp                              |
| `Message`            | 179           | 182                 | thiếu đúng 3 tin ghi sau snapshot |
| `_prisma_migrations` | 33            | 33                  | khớp                              |

Production có đúng **3 tin** với `createdAt > '2026-11-14T06:12:46Z'`; tin mới nhất trong bản
khôi phục là `2026-11-14 05:55:19.21`. Vậy 179 + 3 = 182, không mất hàng nào tính tới mốc chụp.

## 3. Khôi phục uploads

```bash
tar -xzf uploads-20261114T061246Z.tar.gz -C restore-uploads
```

Giải nén **101 ms**: 22 tệp, tổng **86.008 byte**; `gzip -t` đạt. So từng tệp với volume
`pingprod_uploads` trên VPS (đọc read-only): đúng 22 tệp, đúng 86.008 byte, **SHA-256 của cả 22
tệp trùng**. Không tệp nào đổi giữa lúc backup và lúc đọc lại; cách này chưa chứng minh tar nhất
quán khi có người đang tải tệp lên.

## 4. API trên bản khôi phục

Chạy `node dist/main` với `DATABASE_URL` trỏ `ping_restore`, không đổi biến nào khác:
`GET /api/v1/ready` trả **200** sau **3.233 ms** kể từ lúc khởi động tiến trình.

## 5. RTO đo được

Cộng tuần tự ba bước trên dữ liệu này: **1.121 + 101 + 3.233 = 4.455 ms (~4,5 giây)** từ lúc bắt
đầu restore tới khi API sẵn sàng. Mục tiêu đã duyệt là RTO ≤ 60 phút; số này thấp hơn rất nhiều
nhưng **không đại diện**: DB chỉ 122 KB / 179 tin, uploads 86 KB, restore cùng máy, không qua
mạng, không tính thời gian tải bản sao và không có staging.

## 6. Giới hạn

- Chưa thử trên staging hay dữ liệu hàng chục GB; chưa đo thời gian restore khi có tải ghi.
- Chưa có PITR; RPO phụ thuộc lịch cron 02:30 UTC và bản backup gần nhất (mục tiêu ≤ 24 giờ).
- Khóa age do OWNER giữ; agent chỉ nhận tệp đã giải mã, không đọc khóa riêng.
- Restore uploads đã kiểm hash nhưng chưa chạy worker/queue trên volume khôi phục; chưa thử
  tải ảnh/PDF qua API với quyền/outsider trên bản khôi phục.

Dọn bản thử sau khi ghi số: `DROP DATABASE ping_restore` và xóa thư mục giải nén tạm. Runbook:
[backup-restore.md](../../../runbook/backup-restore.md).

# Sao lưu và khôi phục Postgres

Trong v0.1.0, dữ liệu bền nằm ở Postgres (Redis chỉ giữ cache, bộ đếm, pub/sub: mất Redis không
mất dữ liệu bền). Runbook này mô tả sao lưu Postgres; khi v0.2.0 có tệp đính kèm, backup phải
bao phủ cả tệp theo [phạm vi đã duyệt](../adr/0038-release-scope-v0.2.0.md).

Các lệnh dưới đây **đã được chạy thật** trên CSDL dev (561 user, 146 server, 27.860 tin): sao lưu rồi khôi phục vào một
CSDL mới cho ra số hàng giống hệt (kể cả `_prisma_migrations`). Tên container là của compose dev (`ping-postgres-1`); với
stack khác thay bằng tên container tương ứng (`docker compose ps`).

Trên production `pingprod`, quy trình đã chạy thật ngày 2026-11-14 với snapshot nhỏ (8 user, 179 tin):
số hàng và hash uploads khớp nguồn, API `/ready` 200 sau 3,2 giây; RTO đo **~4,5 giây** cho dữ liệu
122 KB, không đại diện cho dữ liệu lớn. Số liệu và lệnh chi tiết ở
[V5-backup](../v0.2.0/evidence/V2-final/V5-backup.md).

## Sao lưu

```bash
# Định dạng "custom" (-Fc): nén sẵn, khôi phục chọn lọc được bằng pg_restore
docker exec ping-postgres-1 pg_dump -U ping -Fc ping > ping-$(date +%Y%m%d-%H%M).dump
```

- Đặt thành lịch (cron hoặc tương đương), giữ vài bản gần nhất, **lưu ra ngoài máy chủ chạy DB** (bucket, máy khác).
- Postgres managed (Cloud SQL, RDS…) có sao lưu tự động và khôi phục về thời điểm bất kỳ (PITR): bật nó, và vẫn thử
  khôi phục định kỳ.
- Trước mỗi lần migrate trên dữ liệu thật, sao lưu thủ công một bản.

### Production: cron, age và kéo về máy

- `/etc/cron.d/ping-backup` chạy `deploy/backup.sh` hằng ngày **02:30 UTC** bằng user `deploy`,
  giữ **14 ngày** tại `/opt/ping/backups`. Script dump Postgres `-Fc`, tar volume
  `pingprod_uploads`, rồi mã hóa cả hai bằng `age -R /opt/ping/backup-recipient.txt`.
  Recipient chỉ chứa khóa công khai; khóa riêng do OWNER giữ ngoài VPS.
- Chỉ bản `.age` rời VPS. `scripts/pull-backup.ps1` tải các bản `.age` về `D:\ping-backups`
  (bỏ qua tệp đã có, giữ 7 bản mới nhất).
- Giải mã trên máy OWNER: `age -d -i <age-key.txt> -o <file> <file>.age`. Không đưa khóa riêng
  vào repo, biến môi trường dùng chung hay lịch sử shell.

## Khôi phục (vào CSDL mới, không ghi đè)

Luôn khôi phục vào CSDL **mới**, kiểm tra, rồi mới chuyển ứng dụng sang (hoặc đổi tên). Đừng khôi phục đè lên CSDL đang
chạy.

```bash
docker exec ping-postgres-1 psql -U ping -d postgres -c "CREATE DATABASE ping_restore"
docker exec -i ping-postgres-1 pg_restore -U ping -d ping_restore --no-owner --exit-on-error < ping-20261020-1500.dump
```

## Kiểm tra bản khôi phục

So số hàng các bảng chính giữa CSDL gốc và bản khôi phục, và số migration đã áp:

```bash
for db in ping ping_restore; do
  docker exec ping-postgres-1 psql -U ping -d $db -tAc \
    'select (select count(*) from "User"), (select count(*) from "Server"), (select count(*) from "Message"), (select count(*) from _prisma_migrations)'
done
```

Hai dòng phải giống nhau; nếu nguồn đang nhận ghi, lệch đúng bằng số bản ghi tạo sau mốc backup là
bình thường (kiểm bằng `select count(*) from "Message" where "createdAt" > '<mốc dump>'`). Sau đó,
chạy API trỏ vào CSDL khôi phục và gọi `/api/v1/ready` (phải 200). Dọn bản thử:
`DROP DATABASE ping_restore`.

Với uploads, giải nén bản tar vào thư mục mới và so từng tệp với volume nguồn (đọc read-only):

```bash
tar -xzf uploads-<stamp>.tar.gz -C restore-uploads
sudo docker run --rm -v pingprod_uploads:/u:ro alpine:3.22 \
  sh -c 'find /u -type f -exec sha256sum {} \; | sed "s#/u/##" | sort'
find restore-uploads -type f -exec sha256sum {} \; | sed 's#restore-uploads/##' | sort
```

Hai danh sách phải trùng tên và hash. Lần diễn tập 2026-11-14: 22 tệp, 86.008 byte, hash trùng;
giải nén 101 ms, Postgres restore 1.121 ms, API sẵn sàng 3.233 ms. Tổng RTO tuần tự ~4,5 giây trên
dữ liệu nhỏ; ghi lại số đo mỗi lần diễn tập thay vì dùng lại con số này cho dữ liệu lớn.

## Sau khi khôi phục

- Trỏ `DATABASE_URL` của API sang CSDL khôi phục (hoặc đổi tên hai CSDL), khởi động lại API.
- Redis không cần khôi phục: cache quyền tự hết hạn sau 30 giây, client đang mở sẽ nối lại và tải lại dữ liệu qua REST.
- Refresh token nằm trong bảng `Session` nên được khôi phục cùng; người dùng không phải đăng nhập lại. Nếu nghi ngờ
  khóa đã lộ, thu hồi mọi phiên: `UPDATE "Session" SET "revokedAt" = now() WHERE "revokedAt" IS NULL`.
- Ghi lại sự cố: mất dữ liệu trong khoảng giữa bản sao lưu và thời điểm hỏng (RPO) là bao nhiêu.

## Giới hạn còn lại

### Tệp đính kèm v0.2.0 (TG.6)

Backup phải lấy **Postgres cùng thư mục `ATTACHMENT_STORAGE_DIR`**. Dev mặc định `.uploads`
ở gốc repo; compose production mẫu dùng named volume `uploads` ở `/app/uploads`, chung giữa API
và worker. Không chỉ sao lưu thumbnail: cần cả `.ready`, `.thumb` và `.raw` còn trong queue.

Để có snapshot nhất quán: tạm chặn ghi ở proxy, dừng API và worker; dump Postgres rồi sao lưu
toàn bộ volume, ghi manifest hash. Giữ trạng thái dừng tới khi cả hai snapshot xong. Tạo bản sao
trên đích mới, không ghi đè nguồn. Mã hóa trước khi đưa bản sao ra ngoài máy; khóa lưu riêng.
Khôi phục vào **DB và volume mới**, bảo toàn quyền node UID 1000; trỏ cả API/worker vào cùng
thư mục. Đối chiếu số hàng Attachment, hash file, thử tải ảnh/PDF có quyền và từ chối outsider;
khởi động worker, xác nhận queue tiếp tục và tệp đã xóa không tải được.

Docker copy dùng được khi container API đã dừng: `docker cp <api-container>:/app/uploads <backup-dir>`;
dump dùng `docker exec <postgres-container> pg_dump -U ping -Fc -f /tmp/attachments.dump ping`
rồi `docker cp` file dump ra đích. Không redirect nhị phân qua Windows PowerShell 5 vì có thể
đổi encoding.

Đã diễn tập ngày 2026-11-14 trên snapshot production thật: restore Postgres + uploads vào đích
local mới, 22 tệp/86.008 byte với hash trùng volume nguồn, API `/ready` 200
([V5-backup](../v0.2.0/evidence/V2-final/V5-backup.md)). Chưa chạy trên staging, chưa thử tải
ảnh/PDF qua API trên bản khôi phục, chưa khởi động worker/queue trên volume khôi phục.

Production đã có cron 02:30 UTC, retention 14 ngày, mã hóa age và bản kéo ngoài máy; mục tiêu
RPO ≤ 24 giờ dựa vào lịch này, chưa có PITR. Một lần restore có đối chiếu đã đạt với dữ liệu nhỏ;
chưa có số đo staging hay dữ liệu hàng chục GB. Cron hiện **không dừng API/worker** khi tar volume,
nên DB và uploads không phải snapshot nhất quán tuyệt đối; khi cần RPO/RTO nghiêm ngặt phải tạm
chặn ghi, dừng API/worker, rồi mới dump và tar như mô tả ở trên.

Bản diễn tập trên stack luyện tập chạy local (cùng tên project `pingprod` trên Docker Desktop,
[ADR-0036](../adr/0036-local-deployment.md)) chỉ so số hàng và fingerprint 10 bảng; lần diễn tập
2026-11-14 ở trên thay nó bằng restore thật từ snapshot production. Vẫn chưa thử khôi phục trên
bản dữ liệu hàng chục GB.

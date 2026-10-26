# Sao lưu và khôi phục Postgres

Trong v0.1.0, dữ liệu bền nằm ở Postgres (Redis chỉ giữ cache, bộ đếm, pub/sub: mất Redis không
mất dữ liệu bền). Runbook này mô tả sao lưu Postgres; khi v0.2.0 có tệp đính kèm, backup phải
bao phủ cả tệp theo [phạm vi đã duyệt](../adr/0038-release-scope-v0.2.0.md).

Các lệnh dưới đây **đã được chạy thật** trên CSDL dev (561 user, 146 server, 27.860 tin): sao lưu rồi khôi phục vào một
CSDL mới cho ra số hàng giống hệt (kể cả `_prisma_migrations`). Tên container là của compose dev (`ping-postgres-1`); với
stack khác thay bằng tên container tương ứng (`docker compose ps`).

## Sao lưu

```bash
# Định dạng "custom" (-Fc): nén sẵn, khôi phục chọn lọc được bằng pg_restore
docker exec ping-postgres-1 pg_dump -U ping -Fc ping > ping-$(date +%Y%m%d-%H%M).dump
```

- Đặt thành lịch (cron hoặc tương đương), giữ vài bản gần nhất, **lưu ra ngoài máy chủ chạy DB** (bucket, máy khác).
- Postgres managed (Cloud SQL, RDS…) có sao lưu tự động và khôi phục về thời điểm bất kỳ (PITR): bật nó, và vẫn thử
  khôi phục định kỳ.
- Trước mỗi lần migrate trên dữ liệu thật, sao lưu thủ công một bản.

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

Hai dòng phải giống nhau (nếu gốc đang nhận ghi thì lệch một chút là bình thường). Sau đó, chạy API trỏ vào CSDL
khôi phục và gọi `/api/v1/ready` (phải 200). Dọn bản thử: `DROP DATABASE ping_restore`.

## Sau khi khôi phục

- Trỏ `DATABASE_URL` của API sang CSDL khôi phục (hoặc đổi tên hai CSDL), khởi động lại API.
- Redis không cần khôi phục: cache quyền tự hết hạn sau 30 giây, client đang mở sẽ nối lại và tải lại dữ liệu qua REST.
- Refresh token nằm trong bảng `Session` nên được khôi phục cùng; người dùng không phải đăng nhập lại. Nếu nghi ngờ
  khóa đã lộ, thu hồi mọi phiên: `UPDATE "Session" SET "revokedAt" = now() WHERE "revokedAt" IS NULL`.
- Ghi lại sự cố: mất dữ liệu trong khoảng giữa bản sao lưu và thời điểm hỏng (RPO) là bao nhiêu.

## Chưa làm

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
đổi encoding. Ghi lại thời gian dừng và kết quả restore; chưa có số đo restore staging TG.6.

Chưa có lịch sao lưu tự động cho staging, retention hay bản sao ngoài máy đã được kiểm chứng.
Các việc này thuộc v0.2.0 ([ADR-0037](../adr/0037-release-scope-v0.1.0.md)); runbook staging và
chính sách backup riêng sẽ được chốt theo môi trường thực tế. Mục tiêu đã duyệt là RPO ≤ 24 giờ,
RTO ≤ 60 phút, backup mã hóa ngoài máy và một lần restore có đối chiếu; đây chưa phải số đo đạt.

Đã diễn tập thêm trên stack production chạy local `pingprod`: so số hàng và fingerprint 10 bảng,
xem [ADR-0036](../adr/0036-local-deployment.md) và [runbook local](deploy.md). Bằng chứng đó không
thay thế lần restore trên staging. Chưa thử khôi phục trên bản dữ liệu hàng chục GB.

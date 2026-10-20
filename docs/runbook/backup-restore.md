# Sao lưu và khôi phục Postgres

Postgres là nguồn sự thật duy nhất (Redis chỉ giữ cache, bộ đếm, pub/sub: mất Redis không mất dữ liệu). Chỉ cần sao
lưu Postgres.

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

Chưa có lịch sao lưu tự động nào trong repo (phụ thuộc nơi chạy: sẽ thêm cùng `deploy.md` trước `v0.1.0`), và chưa
thử khôi phục trên bản dữ liệu hàng chục GB.

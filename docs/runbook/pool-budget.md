# Ngân sách kết nối Postgres (T1.1)

Mỗi instance API mở pool `pg` với `PG_POOL_MAX` kết nối (mặc định 10). Ngân sách:

```
instance_count × PG_POOL_MAX ≤ max_connections (Postgres) − dự phòng (≥ 5)
```

- `max_connections` mặc định của Postgres 17 là 100. Với 3 instance × 10 = 30, còn 70 dự phòng cho
  worker/migration/admin.
- Khi scale instance, cập nhật `PG_POOL_MAX` hoặc `max_connections` (qua `postgresql.conf` / compose)
  trước khi tăng instance; nếu không, pool cạn → Prisma báo lỗi → API trả 503.
- `connectionTimeoutMillis` = 5s: nếu pool cạn, request chờ tối đa 5s rồi trả 503 (không treo).
- Biến môi trường: `PG_POOL_MAX` (apps/api `.env`). Migration/worker dùng cùng budget; tổng instance
  (API + worker) phải nằm trong ngân sách.

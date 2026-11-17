# ADR-0102: Replica đọc có định tuyến và rơi về primary

Status: accepted (thay quyết định "chưa dùng replica" của [ADR-0095](0095-tim-kiem-tu-hiem-tren-bang-lon.md))
Date: 2026-11-17

## Context

B5 đo replica streaming trên một máy (lag cỡ mili giây) nhưng chưa dùng. Mục tiêu học tập: tách đọc/ghi thật và xử lý đọc-sau-ghi.

## Decision

1. Compose có `postgres-replica` (Postgres 17, `pg_basebackup -R` lần đầu qua `ops/postgres/replica-entrypoint.sh`); primary mở `hba_file` riêng
   (`ops/postgres/pg_hba.conf`) để replica kết nối bằng mật khẩu. Prod: chỉ trong mạng compose.
2. `ReadDbService` giữ một `PrismaClient` thứ hai trỏ vào `REPLICA_DATABASE_URL` (bỏ trống thì mọi đọc đi primary). Không dùng `$extends` read-replicas để
   khỏi đổi kiểu của `PrismaService` ở mọi nơi.
3. **Chỉ định tuyến những đọc chấp nhận dữ liệu cũ:** tìm kiếm (cả thăm dò) và trang tin cũ phía sau con trỏ `before`. Trang đầu, `after`, `around`, mọi ghi
   và mọi đọc cần đọc-sau-ghi vẫn đi primary.
4. Sức khỏe replica kiểm mỗi 3 giây: đang ở chế độ phục hồi, có `pg_stat_wal_receiver`, và WAL đã nhận nhưng chưa áp dụng (`pg_wal_lsn_diff`) dưới
   `REPLICA_MAX_LAG_BYTES` (1 MiB). Không dùng `now() - pg_last_xact_replay_timestamp()`: khi primary không có ghi nào mốc đó cũ dần dù replica đã đuổi kịp.
   Không lành thì rơi về primary. Metric `db_reads_total{target}` và `dependency_up{name="postgres_replica"}`.

## Evidence

`pnpm --filter api drill:replica` (7/7): trang đầu không đi replica; trang cũ đọc từ replica và trả đúng; dừng container replica thì trong vài giây
`dependency_up` về 0, request vẫn 200 và đọc rơi về primary; bật lại thì quay về replica.

## Consequences

- Người dùng có thể thấy dữ liệu cũ vài trăm ms trong tìm kiếm và trang cũ (ví dụ vừa sửa một tin rồi tìm).
- Thêm một Postgres (cùng RAM/đĩa như primary khi sao chép); pool kết nối nhân đôi trên mỗi API (ngân sách `max_connections` của replica độc lập).
- Chưa có quy trình promote replica thành primary (failover), chưa đo trên hai máy thật, chưa deploy lên VPS.
- Để tiết kiệm đĩa cho lần sao chép đầu, tôi xóa DB `ping_load` (11 GB dữ liệu giả của phép đo B5, tái tạo được bằng script seed).

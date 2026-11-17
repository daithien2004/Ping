# ADR-0097: Hai bản sao API trong compose prod, cập nhật tuần tự

Status: accepted
Date: 2026-11-17

## Context

[ADR-0092](0092-nhieu-ban-sao-api-sau-nginx.md) đã chứng minh trên laptop rằng nhiều bản sao API sau Nginx chạy được và chịu được
restart cuốn chiếu hoặc giết một bản sao. Nhưng stack production thật (`docker-compose.prod.example.yml`, VPS) vẫn chạy **một** API:
mỗi lần deploy, API ngừng phục vụ trong lúc thay.

## Decision

1. Hai service `api-1` và `api-2`, cùng alias mạng `api`, cùng định nghĩa (YAML anchor); Nginx giữ `server api:4000 resolve`
   nên nhận cả hai IP, không cần sticky (WebSocket-only). Thêm bản sao thứ ba: thêm service `api-3` như `api-2`.
2. **Không dùng `deploy.replicas`/`--scale`**: đo cho thấy `compose up` thay mọi bản sao của một service gần như cùng lúc.
   `deploy/deploy.sh` có hàm `roll_up()` thay `api-1`, đợi khỏe, rồi mới thay `api-2`.
3. Ngân sách Postgres: 2 × `PG_POOL_MAX` (10) + worker (10) = 30, dưới `max_connections` mặc định 100.
   Cả hai bản sao dùng chung volume `uploads`.

## Evidence

Stack pingprod local, Docker VM 3,1 GB, một lần chạy mỗi chế độ ([dữ liệu](../perf/data/2026-11-17-b2-prod/compose-rollout.txt)),
poll `/api/v1/health` qua Nginx trong lúc thay cả hai bản sao:

| Cách cập nhật                        | Request thành công | Lỗi                   |
| ------------------------------------ | ------------------ | --------------------- |
| `compose up api-1 api-2` (song song) | 2.043              | 345 (14,4%, toàn 502) |
| Tuần tự (`roll_up`)                  | 2.858              | **0**                 |

Bài học khi đo: poll `/ready` cho thấy 503 ở chế độ tuần tự, nhưng đó là `/ready` trả 503 có chủ đích lúc bản sao đang rút
(`SHUTDOWN_GRACE_MS`) trong khi Nginx vẫn gửi request thường tới nó và nó vẫn phục vụ; đo bằng `/health` mới phản ánh người dùng.

Giết một bản sao (`docker kill pingprod-api-1-1`) trong lúc poll `/health`: 0 lỗi / 1.291 request, bản còn lại phục vụ. Lưu ý: `docker kill`
không kích hoạt `restart: unless-stopped` (Docker coi là dừng thủ công), nên bản bị giết không tự lên lại trong thử nghiệm này; việc tự khởi động
lại khi tiến trình thoát bất thường chưa kiểm. RAM đo trên stack local lúc rảnh: mỗi API ~255 MiB, worker 171, Kafka 282, Qdrant 55, web 43, Postgres 40,
Nginx 13, Redis 5 (tổng ~1,1 GiB).

## Consequences

- Deploy trên VPS không còn ngắt API (web vẫn là một bản và vẫn có khoảng ngắt nhỏ khi thay).
- Thêm RAM: mỗi API ~200–300 MB. Tổng stack ~1,1 GiB lúc rảnh trên local; VPS 3,9 GB, chưa đo sau khi deploy.
- Chưa kiểm: socket đang nối bị ngắt khi bản sao rút (client nối lại và vá tin bằng cursor, theo ADR-0044/0092), chưa đo lại trên stack này;
  chưa deploy lên VPS thật; job CI `docker` đã sửa tên container nhưng chưa chạy trên CI.
- Hai bản sao chạy cùng một ảnh, nên lỗi trong ảnh làm hỏng cả hai; rollout tuần tự bị chặn nếu bản đầu không khỏe (`--wait`) và
  `rollback()` đưa về tag trước.

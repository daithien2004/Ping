# Deploy `37ae8cb` lên production (2026-11-14)

Máy kiểm: Windows, repo `daithien2004/Ping`, nhánh `main`. VPS `20.193.75.48`, đăng nhập `azureuser` bằng khóa riêng (chỉ dùng để kiểm, không đưa vào repo). Mọi mốc thời gian dưới đây là UTC.

## 1. CI trên đúng commit

| Mục                | Giá trị                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| Run                | [43551156623](https://github.com/daithien2004/Ping/actions/runs/43551156623) |
| Commit             | `37ae8cb43c95a57f303d6b24b08308b75e5ae481`                                   |
| Bắt đầu → kết thúc | 03:20:53Z → 03:31:47Z (10 phút 54 giây)                                      |
| Kết quả            | **success**                                                                  |

12 job đều xanh: `changes`, `verify`, `web-e2e (1,3)`, `web-e2e (2,3)`, `web-e2e (3,3)`, `visual`, `migrations`, `api-e2e`, `security`, `docker`, `drills`, `lighthouse`.

Hai bước mà `gate-local.md` để lại cho CI:

- `web-e2e`: cả ba shard xanh. Shard `(1,3)` chứa `apps/web/e2e/messages.spec.ts`, gồm test ở dòng 46 (`3 + 5. gửi khi đang đọc tin cũ: hiện ngay (đang gửi), được xác nhận, tự xuống đáy`) — test này trì hoãn `POST /channels/*/messages` 500 ms rồi kiểm `aria-busy`, nội dung composer và khoảng cách tới đáy. **Đạt.**
- `visual`: visual regression xanh, không có baseline mới.

## 2. Publish and deploy

| Mục                | Giá trị                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| Run                | [43552102440](https://github.com/daithien2004/Ping/actions/runs/43552102440) |
| Bắt đầu → kết thúc | 03:31:49Z → 03:39:43Z (7 phút 54 giây)                                       |
| Build và push GHCR | 03:31:52Z → 03:38:20Z                                                        |
| Deploy lên VPS     | 03:38:22Z → 03:39:42Z                                                        |
| Kết quả            | **success**                                                                  |

Workflow chạy tự động sau khi CI xanh (`workflow_run`), không dispatch tay. Ba image `ping-api`, `ping-migrate`, `ping-web` được tag theo SHA commit.

## 3. SHA trên VPS khớp commit

```text
local:  git rev-parse HEAD              → 37ae8cb43c95a57f303d6b24b08308b75e5ae481
VPS:    /opt/ping/images.env            → IMAGE_TAG=37ae8cb43c95a57f303d6b24b08308b75e5ae481
```

Hai giá trị trùng khớp tại thời điểm kiểm 03:40:49Z.

## 4. Endpoint công khai

```text
GET https://20.193.75.48/api/v1/health → 200 {"status":"ok"}
GET https://20.193.75.48/api/v1/ready  → 200 database up (2 ms), redis up
```

Trong lúc rollout, `/api/v1/ready` trả `502 Bad Gateway` khoảng một phút (Nginx còn trỏ vào container cũ đang dừng). Sau khi job deploy báo xanh thì 200 như trên.

## 5. Trạng thái container

Lệnh theo mục “Mỗi lần phát hành” của `docs/runbook/ci-cd-vps.md`:

```text
cd /opt/ping
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
  --env-file .env.prod --env-file images.env ps
```

| Service  | Trạng thái                  |
| -------- | --------------------------- |
| api      | Up About a minute (healthy) |
| web      | Up About a minute (healthy) |
| worker   | Up About a minute (healthy) |
| nginx    | Up 2 days                   |
| postgres | Up 5 days (healthy)         |
| qdrant   | Up 5 days (healthy)         |
| redis    | Up 5 days (healthy)         |

`nginx`, `postgres`, `qdrant`, `redis` không khởi động lại trong lần deploy này: chỉ ba image ứng dụng đổi tag.

## Kết luận

Bản chạy trên production là `37ae8cb`, khớp commit đã qua CI. Ba service ứng dụng healthy, database và redis báo up qua `/ready`. Bước CI còn nợ ở `gate-local.md` đã có kết quả: `web-e2e` ba shard xanh (gồm `messages.spec.ts:46`) và `visual` xanh.

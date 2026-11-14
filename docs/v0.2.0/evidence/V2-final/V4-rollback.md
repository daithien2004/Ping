# V4 — Diễn tập rollback theo SHA (2026-11-14)

Máy kiểm: Windows; thao tác workflow do OWNER bấm trên GitHub Actions (agent không có `gh`/token).
Xác minh trên `https://20.193.75.48`. Mốc thời gian UTC lấy từ GitHub API và
`docker inspect .State.StartedAt`.

## 1. Chọn SHA rollback (chỉ đọc)

| Mục                    | Giá trị                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| Bản đang chạy          | `37ae8cb43c95a57f303d6b24b08308b75e5ae481` ([deploy.md](deploy.md))             |
| SHA đích               | `ea9b5166b6f0536e54f9889319d0c1d4692eb69d` (first-parent của merge)             |
| Image GHCR             | `ghcr.io/daithien2004/ping-api` có tag `ea9b516…` và `37ae8cb…`                 |
| Migration giữa hai SHA | `git diff --name-status ea9b516..HEAD -- apps/api/prisma/migrations` → **rỗng** |

Không có migration nào giữa hai bản, nên điều kiện "chỉ rollback khi mọi migration là expand"
theo [rollback.md](../../../runbook/rollback.md) bước 3 được thỏa.

## 2. Rollback (chiều đi)

Workflow **Publish and deploy** → `workflow_dispatch`, `rollback_tag` = SHA đích,
run [43564818232](https://github.com/daithien2004/Ping/actions/runs/43564818232):

| Mốc                         | Thời điểm (UTC)                 |
| --------------------------- | ------------------------------- |
| Run tạo → kết thúc          | 06:07:56 → 06:08:37 (41 giây)   |
| API container khởi động lại | 06:08:29                        |
| Web container khởi động lại | 06:08:24                        |
| Job deploy                  | success (build/publish skipped) |

Kiểm sau deploy: `images.env` → `IMAGE_TAG=ea9b516…`; `GET /api/v1/ready` → **200**.

Xác minh hành vi lúc **06:14:52Z** bằng API + socket thật (`demo1`, server "Ping Demo", `# general`):

- `POST /auth/login` → 200.
- `POST /channels/<general>/messages` → **201**, message `01a1d8b1-…b69554`.
- `GET /channels/<general>/messages?limit=10` → tin vừa gửi có trong danh sách.
- Socket.IO (`wss`, auth token) → `connect` thành công, `channel.join` không lỗi.

## 3. Roll forward

Cùng workflow, `rollback_tag` = SHA hiện tại `37ae8cb…`,
run [43565925886](https://github.com/daithien2004/Ping/actions/runs/43565925886):

| Mốc                         | Thời điểm (UTC)               |
| --------------------------- | ----------------------------- |
| Run tạo → kết thúc          | 06:21:20 → 06:21:59 (39 giây) |
| API container khởi động lại | 06:21:51                      |
| Web container khởi động lại | 06:21:46                      |

Kiểm sau deploy: `images.env` → `IMAGE_TAG=37ae8cb…`; `/ready` → **200**.

Xác minh hành vi lúc **06:32:05Z**: login 200, gửi tin 201 (`01a1d8c1-…c0f6`), tin có trong
danh sách, socket nối được. Tin gửi lúc đang chạy bản cũ (`01a1d8b1…`) vẫn nằm trong danh sách
sau khi lên bản mới — dữ liệu không mất khi đổi chiều.

## 4. Nhận xét

- Tổng thời gian mỗi chiều ~40 giây (workflow) và ~33 giây từ lúc run bắt đầu tới lúc API container
  khởi động lại; không có lỗi `migrate`, `ready` xanh ngay.
- Production chạy bản cũ từ 06:08:29 tới 06:21:51 (~13 phút 22 giây) trong lúc diễn tập; hai tin
  kiểm gửi ở hai chiều đều đọc lại được.
- Lần dispatch đầu tiên (06:07:56) là chiều rollback; chiều roll-forward là run thứ hai
  (06:21:20). Nếu bấm "Re-run all jobs" trên run cũ, input `ea9b516` được dùng lại — phải tạo run
  mới.

## 5. Chạy lại

```bash
# Xem SHA đang chạy
ssh azureuser@20.193.75.48 'sudo cat /opt/ping/images.env'
# Kiểm sẵn sàng
curl -k https://20.193.75.48/api/v1/ready
```

Sau đó dispatch workflow với SHA mong muốn và kiểm lại như mục 2–3.

**Kết luận:** rollback và roll-forward **đạt**; không có migration chặn chiều lùi; dữ liệu ghi
trong lúc chạy bản cũ vẫn đọc được ở bản mới.

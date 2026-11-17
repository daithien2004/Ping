# S2 — API trên k3s

**Câu hỏi:** chạy API trên k3s thì rollout không gián đoạn và chịu chết pod có tốt hơn Compose + nginx ([ADR-0092](../../docs/adr/0092-nhieu-ban-sao-api-sau-nginx.md)) không, và tốn công gì?

**Cách đo:** `rancher/k3s:v1.31.4-k3s1` chạy một node trong container Docker (`--privileged`, loopback 6443; lệnh đầy đủ ở dưới), image `ping-api:scale`
nạp bằng `ctr images import`, Deployment 2 replica (`maxUnavailable: 0`, `maxSurge: 1`, readiness `/api/v1/ready` mỗi 2 giây, grace 40 giây),
Postgres/Redis là container compose dev trên máy (`host.docker.internal`), DB `ping_demo`. Từ trong node, một vòng `wget` liên tục tới ClusterIP
của Service đếm request thành công/thất bại (timeout 2 giây) trong khi gây nhiễu. `node experiments/s2-k3s/run.mjs`; kết quả thô: [result.json](result.json).

```bash
docker run -d --name ping-k3s --privileged --tmpfs /run --tmpfs /var/run -p 127.0.0.1:6443:6443 \
  rancher/k3s:v1.31.4-k3s1 server --disable traefik --disable metrics-server --disable servicelb --tls-san 127.0.0.1
```

## Kết quả (một lần chạy mỗi phép)

| Phép đo                                  | Kết quả                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| Nạp image 1,16 GB vào node               | 88,7 giây (một lần)                                       |
| Deployment 2 replica sẵn sàng            | 4,1 giây                                                  |
| Rollout cuốn chiếu (đổi biến môi trường) | 5,4 giây; **61 / 14.891 request lỗi (0,41%)**             |
| Xóa pod ngay (`--grace-period=0`)        | Về lại 2 pod sẵn sàng sau 3,0 giây; 0 / 9.012 request lỗi |

## Kết luận (và giới hạn)

- Rollout **không** hoàn toàn không gián đoạn: 0,41% request lỗi, dù đã có `maxUnavailable: 0`, readiness và grace. Tôi chưa chẩn đoán nguyên nhân;
  giả thuyết (chưa kiểm chứng) là kube-proxy gỡ endpoint của pod đang dừng chậm hơn một khoảng so với lúc API ngừng nhận. So sánh: ở Compose + nginx ([báo cáo scale-out](../../docs/perf/2026-11-17-scale-out.md)) cuốn chiếu và SIGKILL đều cho 0 lỗi 5xx ở client, vì nginx thử upstream kế tiếp; phép đo k3s ở đây không có lớp thử lại đó nên **không so trực tiếp được** (khác công cụ đo, khác tải), nhưng chắc chắn k3s không cho kết quả tốt hơn trong lần chạy này.
- Phép xóa pod cho 0 lỗi trong một lần chạy, không đủ mẫu để tin rằng nó luôn như vậy.
- **Chưa làm:** autoscale theo số socket (cần metrics adapter và metric tùy biến), Realtime tách riêng, nhiều node, Ingress thật, WebSocket qua Service.
- Công sức so với Compose: thêm một lớp (image phải nạp vào containerd, manifest, probe, secret), 4 giây để lên 2 replica là nhanh nhưng lợi ích
  thực chỉ rõ khi có nhiều máy hay cần autoscale; với một VPS như hiện tại Compose đủ. Số đo trên VM Docker 3,1 GB, dữ liệu nhỏ (`ping_demo`), một lần chạy.

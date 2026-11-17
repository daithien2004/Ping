# Cập nhật Ping-docs còn chờ (PLAN-SCALE-PING §10)

Hook `workflow-policy` của repo Ping chỉ cho ghi trong `D:\Ping`, nên phiên làm việc này **chưa sửa được `D:\Ping-docs`**. Các số liệu
đã có đủ trong `docs/perf/` và ADR-0090 đến 0095; việc còn lại là chép vào các `src/topics/*.data.mjs`, rồi chạy
`node scripts/build-question-bank.mjs`, `node scripts/check-docs.mjs`, `pnpm test`, `pnpm build`.
Ping-docs đang có thay đổi dở của bạn (`realtime.data.mjs`, `redis.data.mjs`, `registry.mjs`...) nên cần sửa chồng lên đó, không ghi đè.

| Bước   | File                                                                        | Nội dung lấy từ                                                                             |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| B1     | `testing.data.mjs` (v7 k6), `devops.data.mjs` (v7, v8)                      | `docs/perf/2026-11-16-presence-scope.md`; mọi lần đo đều vượt ngưỡng k6, một mẫu mỗi bên    |
| B2     | `devops.data.mjs` (v1, v3), `redis.data.mjs` (v3), `realtime.data.mjs` (v2) | `docs/perf/2026-11-17-scale-out.md`, ADR-0092                                               |
| B3     | `redis.data.mjs` (v4), `realtime.data.mjs` (v6)                             | ADR-0091: emit 2400 → 1494 (batching); nhận 377.073 → 32.071 (−91,5%) với `PRESENCE_SCOPED` |
| B4     | `realtime.data.mjs` (stage mới), `security.data.mjs`, `ARCH`                | `docs/perf/2026-11-17-gateway-isolation.md`, ADR-0093 (chưa tách, kèm điều kiện)            |
| B5     | `database.data.mjs` (stage v8 bên dưới)                                     | `docs/perf/2026-11-17-big-data.md`, ADR-0095                                                |
| B6     | `devops.data.mjs` (v6, v7, v8)                                              | `docs/perf/2026-11-17-dr-drill.md`, `docs/runbook/slo.md`                                   |
| S1     | `realtime.data.mjs` hoặc `redis.data.mjs`                                   | `docs/perf/2026-11-17-bus-redis-vs-kafka.md`, ADR-0094                                      |
| S3, S4 | stage "Thí nghiệm" của `ai`/`database`                                      | `experiments/s3-search/README.md`, `experiments/s4-shard/README.md`                         |

Số nào chưa đo thì ghi "chưa đo": quét outbox ở 10 triệu hàng, RPO/RTO trên máy sạch, lag replica giữa hai máy, Prometheus chạy thật.

## Stage B5 sẵn để chèn vào `database.data.mjs` (sau stage `v7`, thêm `breaks` cho `v7`)

```js
    breaks: 'Mô hình đã đúng ở vài nghìn hàng. Câu hỏi còn lại là khi một bảng lên 10 triệu hàng thì truy vấn nào còn nhanh, và phân vùng hay replica có đáng làm.',
  },
  {
    v: 'v8',
    title: 'Dữ liệu lớn: 10 triệu tin, phân vùng, replica',
    lead: 'Vấn đề ở v7: các index và cursor đã chạy tốt ở dữ liệu nhỏ, nhưng chưa ai đo khi bảng Message lên 10 triệu hàng (bảng và index 6 GB, trong Docker VM 3,1 GB RAM).',
    points: [
      'Phân trang bằng cursor (channelId, id DESC) vẫn vài mili giây ở 10 triệu hàng (trang đầu 0,09 đến 2,3 ms, trang sâu 0,8 đến 3,2 ms, đếm chưa đọc có trần 100 dưới 1,1 ms).',
      'Tìm từ hiếm với ORDER BY id DESC LIMIT 21 mất 75 đến 112 giây: planner ước lượng 50 nghìn hàng khớp nên quét ngược pkey rồi lọc (Rows Removed by Filter 9.999.999); thực tế chỉ có một hàng khớp. Từ phổ biến thì 1 ms.',
      'Lấy hàng khớp qua bitmap index trước rồi mới sắp xếp (CTE MATERIALIZED) còn 48 ms (đo cả truy vấn đầy đủ), nhưng nguy hiểm với từ phổ biến nên có bước thăm dò đếm tối đa 1000 hàng; đã áp vào search.service.ts (ADR-0095). Bản CTE chỉ lấy id rồi join lại Message vẫn 50 s vì planner quét pkey.',
      'Phân vùng RANGE theo id (12 phân vùng) không nhanh hơn, planning time tăng 8 đến 25 ms, và không tạo được khóa duy nhất (channelId, authorId, nonce): khóa duy nhất trên bảng phân vùng phải chứa cột phân vùng.',
      'Replica streaming async cùng máy: replay lag p95 4 ms, đợt ghi 200 nghìn dòng chậm thêm 112 ms; chưa đo giữa hai máy.',
    ],
    more: ['Dữ liệu seed tổng hợp, mỗi truy vấn hai mẫu, VM nhỏ hơn bảng. Quét outbox ở quy mô lớn: chưa đo.'],
    ping: 'Số đo ở docs/perf/2026-11-17-big-data.md. Quyết định: không phân vùng, chưa dùng replica, đã sửa tìm kiếm từ hiếm bằng thăm dò + CTE (ADR-0095).',
    real: { file: 'apps/api/src/modules/messages/search.service.ts', from: 'ORDER BY m.id DESC', n: 1, note: 'ORDER BY id DESC kèm LIMIT kéo planner đi theo pkey khi từ tìm rất hiếm.' },
    qa: [
      { q: 'Vì sao truy vấn có index GIN vẫn có thể mất hơn một phút trên 10 triệu hàng?', a: 'ORDER BY id DESC LIMIT cho planner đi theo pkey và dừng sau đủ hàng khớp; ước lượng sai về số hàng khớp thì nó quét hết bảng. Dấu hiệu: Rows Removed by Filter gần bằng cả bảng.' },
      { q: 'Phân vùng bảng có nhanh hơn không? Với Ping?', a: 'Chỉ khi cắt được phân vùng hoặc để DROP PARTITION. Truy vấn cursor đã vài ms, planning time còn tăng, và unique nonce không tạo được nên chưa phân vùng.' },
      { q: 'Vì sao unique trên bảng phân vùng phải chứa cột phân vùng?', a: 'Mỗi phân vùng có index riêng; Postgres chỉ bảo đảm duy nhất trong từng index nên chỉ chứng minh được toàn bảng khi khóa chứa cột phân vùng.' },
      { q: 'Replica đọc giải quyết gì, kéo theo gì?', a: 'Giảm tải đọc khỏi primary; đổi lại có độ trễ replication nên dữ liệu người dùng vừa ghi vẫn phải đọc từ primary.' },
    ],
  },
```

Thêm vào `ARCH`: node `{ id: 'big', label: 'Dữ liệu lớn', col: 0, row: 4, v: 8, why: '10 triệu tin: cursor vẫn ms, tìm từ hiếm gãy 75 s; phân vùng chặn bởi unique nonce.' }`
và edge `{ from: 'model', to: 'big', v: 8 }`.

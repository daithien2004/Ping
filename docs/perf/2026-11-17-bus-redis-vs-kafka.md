# Báo cáo hiệu năng — Redis Stream và Kafka trên luồng outbox → indexer (S1, 2026-11-17)

Câu hỏi: cùng một luồng `message.*` (phát tuần tự như `OutboxRelayService`, consumer là runner thật của indexer với handler
không làm gì), Redis Stream và Kafka khác nhau thế nào về thông lượng, độ trễ đầu cuối và bộ nhớ?
([ADR-0094](../adr/0094-kafka-lam-duong-chuyen-outbox.md))

## Môi trường

| Mục       | Giá trị                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| Máy       | Laptop Intel i5-11400H, 12 luồng, Windows 11, Docker Desktop (VM 12 CPU, 3,1 GB RAM)                              |
| Redis     | 7.4.11 trong compose dev, DB 3, stream `stream:bench:<id>`                                                        |
| Kafka     | Apache Kafka 3.9.0 KRaft một node, heap ≤ 512 MB, topic 3 partition, replication 1, producer idempotent `acks=-1` |
| Thư viện  | `ioredis` 6.0.0, `kafkajs` 2.2.4, Node v24.22.0                                                                   |
| Công cụ   | `pnpm --filter api loadtest:bus` (`BUS=redis\|kafka N=3000`); producer và consumer cùng một process và cùng máy   |
| Phiên bản | nhánh `feat/scale-b2-b6`                                                                                          |

## Kết quả (3.000 event, hai lần chạy mỗi bên)

| Chỉ số                                  | Redis Stream (lần 1 / 2)              | Kafka (lần 1 / 2)                          |
| --------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Phát 3.000 event tuần tự (ms)           | 963 / 930                             | 4.471 / 3.675                              |
| Thông lượng phát (event/giây)           | 3.115 / 3.226                         | 671 / 816                                  |
| Tổng thời gian tới khi xử lý hết (ms)   | 1.365 / 1.286                         | 4.528 / 3.730                              |
| Độ trễ publish → handler p50 / p95 (ms) | 200 / 353 · 192 / 322                 | 5 / 10 · 4 / 7                             |
| Độ trễ max (ms)                         | 372 / 337                             | 36 / 32                                    |
| RAM của kho lưu 3.000 event             | ~416 KB trong Redis (~139 byte/event) | trên đĩa, không tính vào RAM Redis         |
| RSS container                           | Redis ~12 MiB                         | Kafka 268 MiB lúc rảnh, 442 MiB sau bài đo |

## Cách đọc (và điều không được đọc)

- **Thông lượng:** Redis nhanh hơn khoảng 4 lần ở bước phát và hết việc nhanh hơn khoảng 3 lần. Producer Kafka là `acks=-1` và
  idempotent, mỗi `send` chờ broker ghi nhận (~1,2–1,5 ms), còn `XADD` chỉ chờ Redis trong RAM.
- **Độ trễ không so sánh trực tiếp được.** Redis có độ trễ cao hơn vì producer (3.100/giây) nhanh hơn consumer nên có hàng đợi
  tích lại; consumer Kafka đuổi kịp vì producer chậm hơn. Con số p50 4–5 ms của Kafka phản ánh producer bị giới hạn bởi `acks`,
  không phải Kafka "nhanh hơn" Redis. Muốn so thật cần cùng tốc độ phát cố định.
- **Mức cần thật rất thấp:** relay lấy tối đa 50 event mỗi 500 ms (~100 event/giây), thấp hơn cả hai bên hàng chục lần.
- **Bộ nhớ:** ~139 byte mỗi event trong Redis và `stream:outbox` không có `MAXLEN`/`XTRIM`, nên ngoại suy tuyến tính là
  ~139 MB RAM Redis cho mỗi triệu event nếu không bao giờ cắt (ngoại suy, chưa đo ở quy mô đó). Kafka giữ 7 ngày trên đĩa nhưng
  broker tốn ~270–440 MiB RAM cố định, khoảng ba mươi lần Redis rảnh.

## Giới hạn của lần đo này

- 3.000 event, hai lần chạy mỗi bên; producer và consumer cùng process, cùng máy với Redis/Kafka; Docker VM 3,1 GB.
- Producer tuần tự một event mỗi lần như relay; producer theo lô sẽ cho thông lượng Kafka cao hơn nhiều (chưa đo).
- Handler không làm gì: không đo embedding, Qdrant hay Postgres. Không đo hồi phục khi consumer chết (chỉ test chức năng) và
  không đo trên VPS.
- Một broker, replication 1: không đo hành vi khi có nhiều broker hay mất broker (ngoài drill outage ở ADR-0094).

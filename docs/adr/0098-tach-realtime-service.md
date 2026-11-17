# ADR-0098: Tách service Realtime khỏi API

Status: accepted (thay quyết định "chưa tách" của [ADR-0093](0093-chua-tach-realtime-service.md))
Date: 2026-11-17

## Context

ADR-0093 kết luận chưa tách vì số đo trên laptop chưa chứng minh REST và socket tranh tài nguyên. Nhưng `PLAN-SCALE-PING.md` là kế hoạch học tập:
B4 là một bước cần làm thật để hiểu thiết kế, độ phức tạp và đánh đổi, không chỉ khi số đo bắt buộc. Có thêm một lý do đo được ở mức
vận hành: khi API và socket chung tiến trình, mỗi lần deploy API làm rớt mọi socket.

## Decision (hướng A của plan)

1. **Service `realtime` riêng**: cùng image với API, entrypoint `dist/realtime.js` (`src/realtime.ts`, `RealtimeAppModule`), như `worker` đã làm.
   Chỉ có gateway Socket.IO, `/api/v1/health` và `/api/v1/ready`. Không có route nghiệp vụ, outbox relay, indexer.
2. **API không giữ socket**: vai trò `REALTIME_ROLE=api` dựng một `Server` Socket.IO không cổng dùng chung Redis adapter, nên
   `emit`, `fetchSockets` (số người online) và `socketsLeave` (thu hồi quyền khi kick, đổi role) vẫn tới socket nằm ở service Realtime.
   Chọn cách này thay vì `@socket.io/redis-emitter` vì emitter không có `fetchSockets`, mà API cần nó cho danh sách thành viên online; và
   không phải thêm dependency.
3. **Hợp đồng room trong `packages/shared`** (`rooms.ts`: `userRoom`, `serverRoom`, `channelRoom`, `presenceRoom`) cho cả hai phía; có test.
4. **Xác thực lúc nối** dùng thẳng `JwtService` cùng `JWT_ACCESS_SECRET`. Kiểm quyền lúc `join` dùng `AbilityFactory` + `defineAbilityFor`
   như cũ, với pool Postgres riêng của service Realtime (phương án gọi API nội bộ bị loại: thêm một bước mạng và một điểm chết cho mỗi join).
5. **Vai trò tiến trình** `REALTIME_ROLE`: `all` (mặc định, dev và hầu hết e2e: một tiến trình làm cả hai), `api`, `gateway`. Production
   dùng `api` cho `api-1`/`api-2` và `gateway` cho `realtime-1`.
6. **Nginx**: `/socket.io/` tới upstream `ping_realtime`, `proxy_read_timeout 75s` (> pingInterval 25 s + pingTimeout 20 s). Compose prod có
   `realtime-1` (alias `realtime`); deploy.sh thay nó sau API.

## Evidence

Stack pingprod local, Docker VM 3,1 GB, 30 socket qua Nginx HTTPS trong lúc deploy cuốn chiếu `api-1` rồi `api-2`, một lần chạy mỗi mô hình
([dữ liệu](../perf/data/2026-11-17-b4-split/deploy-api-socket-drops.txt)):

| Mô hình                        | Socket rớt  | REST lỗi (poll `/health`) |
| ------------------------------ | ----------- | ------------------------- |
| Trước: gateway trong API (all) | **30 / 30** | 0 / 1.441                 |
| Sau: service Realtime riêng    | **0 / 30**  | 0 / 1.461                 |

Test `realtime-split.e2e-spec.ts` dựng API (role `api`) và Realtime (`RealtimeAppModule`) thành hai ứng dụng Nest riêng và kiểm: API không có gateway;
tin tạo ở API tới socket nối vào Realtime; join bị từ chối cho người ngoài và id lạ; danh sách thành viên ở API đếm được socket ở Realtime;
kick ở API thu hồi quyền ngay trên socket ở Realtime; Realtime có `/health` nhưng không có route nghiệp vụ. Smoke prod stack đạt qua Nginx.

## Consequences

- Deploy API không còn ngắt socket. Deploy chính service Realtime vẫn ngắt socket của nó (client nối lại và vá tin bằng cursor, ADR-0044);
  một bản `realtime-1` nên toàn bộ socket ngắt cùng lúc. Thêm `realtime-2` (alias `realtime`) để thay từng bản: chưa làm vì RAM VPS (~250 MB mỗi bản).
- Thêm một đơn vị triển khai và một pool Postgres (thêm `PG_POOL_MAX` vào ngân sách `max_connections`).
- Redis chết: emit từ API vẫn im lặng mất (at-most-once, gap recovery bù); `fetchSockets` chỉ đếm cục bộ nên danh sách online ở API rỗng khi Redis chết.
- Chưa đo: độ trễ giao tin trước/sau (plan yêu cầu ghi ngưỡng trước khi đo; chưa đặt ngưỡng nên không kết luận), chưa deploy lên VPS.
- Mô hình `all` còn tồn tại cho dev và test; production không dùng. Không bỏ vì dev chạy một lệnh `pnpm dev`.

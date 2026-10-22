# T1.5 — Chính sách chỗ gọi Redis trên đường request

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.5-redis-policy-audit`, base commit `ea86322`.
- Task: T1.5 (Pha 1).

## Kiểm tra

Audit các chỗ gọi Redis trên đường request: `ability.factory`, `message-rate-limiter`, `login-attempts`,
`idempotency.interceptor`, `http-throttler.guard`, `realtime.service`, `metrics.service`, `health.controller`,
`outbox-relay.service`. Tất cả đều kiểm `isUp` hoặc dùng `failOpen()`/`redisUnavailable()` theo ADR-0026.

- `outbox-relay.service`: chỉ XADD khi `redis.isUp`, retry với backoff; event vẫn nằm trong Postgres.
- `realtime.service`: fetchSockets dùng `isUp ? rooms : rooms.local`.

## Kiểm chứng

| Tiêu chí                | Lệnh                              | Kết quả        |
| ----------------------- | --------------------------------- | -------------- |
| E2E redis-outage        | `redis-outage.e2e-spec.ts`        | pass (6 tests) |
| E2E presence-resilience | `presence-resilience.e2e-spec.ts` | pass           |
| Typecheck API           | `pnpm --filter api typecheck`     | pass           |
| Format                  | `pnpm format:check`               | pass           |

## Giới hạn

- Audit thủ công; chưa có lint tự động bắt chỗ gọi Redis thiếu chính sách (tech-debt P2).

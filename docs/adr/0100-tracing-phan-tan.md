# ADR-0100: Tracing phân tán bằng OpenTelemetry

Status: accepted
Date: 2026-11-17

## Context

Một tin nhắn đi qua REST (API), cột outbox, relay, Kafka rồi consumer (indexer, thống kê), và phát realtime qua tiến trình Realtime.
Metrics và log theo `requestId` không cho thấy một tin nhắn cụ thể đã đi đường nào và chậm ở đâu.

## Decision

1. OpenTelemetry thủ công, tối giản: `@opentelemetry/api`, `sdk-trace-node`, `exporter-trace-otlp-http`, `resources` (dependency mới; chọn tay thay vì
   auto-instrumentation để thấy rõ chỗ ngữ cảnh được truyền). Không đặt `OTEL_EXPORTER_OTLP_ENDPOINT` thì API là no-op: không span, không header.
2. Ngữ cảnh theo W3C `traceparent`: middleware HTTP (nhận `traceparent` của client) → cột `OutboxEvent.traceparent` (migration additive, nullable)
   → span `outbox.publish` ở relay → header Kafka `traceparent` → span consumer (`indexer.handle`, `stats.count`). Client có thể ép trace id bằng cách gửi
   header; không có thì API tự sinh.
3. Jaeger all-in-one (bộ nhớ trong, 2.000 trace) ở compose dev (UI :16686) và prod (không publish cổng). Mỗi tiến trình có `service.name` riêng
   (`ping-api`, `ping-worker`, `ping-realtime`).

## Evidence

`pnpm --filter api drill:trace` (5/5): một request `POST /channels/:id/messages` kèm `traceparent` biết trước tạo **một trace** chứa span HTTP,
`outbox.publish` và `indexer.handle`, trải trên hai service (`ping-api`, `ping-drill-consumer`). Lỗi gặp khi làm: drill đầu trả 500 vì DB dev chưa
áp migration (cột `traceparent`), đúng như rule 13 yêu cầu chạy migrate trước khi deploy code mới.

## Consequences

- Cột mới trên `OutboxEvent` (mỗi tin thêm vài chục byte); code cũ bỏ qua cột nhờ expand/contract.
- Span phát realtime (API → Redis adapter → Realtime) và join socket chưa có: ngữ cảnh chưa đi qua Socket.IO.
- Lấy mẫu: đang ghi mọi trace; ở tải thật cần lấy mẫu (chưa làm). Jaeger bộ nhớ trong mất dữ liệu khi restart.
- Chưa đo chi phí CPU của tracing; chưa bật trên VPS.

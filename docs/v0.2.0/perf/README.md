# Báo cáo hiệu năng v0.2.0

Chưa có baseline mới cho v0.2.0. T0.6 sẽ đo trên commit cụ thể trước khi thay pool/presence;
không đổi nhãn báo cáo cũ thành baseline mới.

- Kịch bản/lệnh hiện có và giới hạn: [perf gốc](../../perf/README.md).
- Số đo lịch sử: [baseline 2026-10-20](../../perf/2026-10-20-baseline.md),
  [presence fix](../../perf/2026-10-20-presence-fix.md).
- Phạm vi tải và ngưỡng đánh giá: [ADR-0038](../../adr/0038-release-scope-v0.2.0.md).
- Báo cáo mới dùng [template.md](template.md), raw evidence theo task.

Load staging từ máy khác qua proxy thực tế; ghi rate limit, profile, lỗi connect/join và giới
hạn generator. Số liệu local không phải SLA hay sức tải staging. Không chạy kịch bản nặng vào
DB đang phục vụ hoặc tự bỏ rate limit/ngưỡng để qua nghiệm thu.

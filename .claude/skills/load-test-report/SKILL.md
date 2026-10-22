---
name: load-test-report
description: Chạy hoặc diễn giải k6, baseline, reconnect storm và báo cáo hiệu năng Ping
---

Đọc docs/perf/README.md, mẫu báo cáo, kịch bản hiện có và tải mục tiêu ADR-0038. Không seed vào
DB người dùng; dùng DB tải riêng theo runbook. Không vô hiệu rate limit để làm số đẹp.

Checklist: commit/image, CPU/RAM/OS, nơi phát tải và nơi đo, proxy/instance, profile/thời lượng,
cách tính latency/lỗi, rate limit bật/tắt và lý do; p50/p95/p99, lỗi connect/join riêng,
số đo trước/sau cùng điều kiện. Load staging từ máy khác; ghi nút cổ chai và giả thuyết cần kiểm.
Giữ raw metrics có ích, không dán token/nội dung tin vào báo cáo.

Đúng: “laptop, chưa đo 10.000 socket, giới hạn generator”. Sai: “production chịu 10.000 user”
từ fan-out local. Không so laptop và staging trên một thang; không tự hạ ngưỡng nghiệm thu.

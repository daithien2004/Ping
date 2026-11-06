# Tài liệu Ping

v0.2.0: [điểm vào công việc](v0.2.0/plan.md), [trạng thái](v0.2.0/status.md),
[nghiệm thu](v0.2.0/acceptance/v0.2.0.md). Dự án đang đóng băng ở mức **bản demo local** (OWNER chốt
2026-11-01, chưa tag `v0.2.0`); xem [Chốt bản demo](v0.2.0/status.md#chốt-bản-demo-2026-11-01).

## Đọc theo nhu cầu

| Bạn muốn                             | Bắt đầu ở đâu                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Chạy dự án local                     | [README gốc](../README.md), [hướng dẫn đóng góp](../CONTRIBUTING.md)                        |
| Hiểu các thành phần và luồng dữ liệu | [Kiến trúc](architecture.md)                                                                |
| Hiểu lý do chọn một thiết kế         | [ADR](adr/), các nhóm bên dưới                                                              |
| Xem hệ thống UI và hướng làm đẹp     | [Hệ thống UI frontend](design/ui-system.md)                                                 |
| Thêm endpoint hoặc socket event      | [Quy ước API](api-conventions.md), schema/type trong `packages/shared`                      |
| Kiểm tra bảo mật                     | [Threat model](security/threat-model.md), [hướng dẫn tự review](review/reading-guide.md)    |
| Thử stack production qua Nginx       | [Hướng dẫn HTTP/HTTPS](../ops/nginx/README.md), [ADR-0035](adr/0035-nginx-reverse-proxy.md) |
| Tra lỗi, migrate, backup, rollback   | [Mục lục runbook](runbook/README.md)                                                        |
| Chạy hoặc đọc load test              | [Hiệu năng](perf/README.md)                                                                 |
| Học cách Discord xử lý               | [Thực hành của Discord](discord-practices.md)                                               |
| Xem sản phẩm chạy                    | [Kịch bản demo 5 phút](v0.2.0/demo.md) (`pnpm demo:prepare` dựng DB demo)                   |
| Xem điều kiện phát hành còn thiếu    | [Nghiệm thu v0.2.0](v0.2.0/acceptance/v0.2.0.md), [v0.1.0](acceptance/v0.1.0.md) (lưu trữ)  |
| Chọn việc cải thiện tiếp theo        | [Nợ kỹ thuật](tech-debt.md)                                                                 |

## Bản đồ ADR

ADR ghi quyết định, lý do, phương án đã loại và hệ quả; số thứ tự thể hiện lịch sử bổ sung.

| Nhóm                                     | ADR                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nền tảng backend, dữ liệu, auth và quyền | 0001–0014: bắt đầu từ [contract](adr/0002-shared-contracts.md), [auth](adr/0007-auth-token-model.md), [dữ liệu](adr/0012-data-model.md), [phân quyền](adr/0013-authorization-runtime.md)                                                                                                                                                                                      |
| Kiến trúc frontend và công cụ            | 0015–0023: [kiến trúc](adr/0015-frontend-architecture.md), [API client](adr/0017-web-api-client.md), [tin nhắn](adr/0020-web-message-list.md), [UI](adr/0023-web-ui-kit-and-tokens.md)                                                                                                                                                                                        |
| Realtime, độ bền, bảo mật và thành viên  | 0024–0030: [realtime](adr/0024-web-realtime.md), [sự cố hạ tầng](adr/0026-failure-modes-and-graceful-shutdown.md), [bảo mật](adr/0027-web-and-api-hardening.md), [presence](adr/0030-member-presence.md)                                                                                                                                                                      |
| Quan sát, CI, hiệu năng và tài liệu      | [0031](adr/0031-observability.md), [0032](adr/0032-ci-and-containers.md), [0033](adr/0033-load-testing.md), [0034](adr/0034-developer-experience-and-docs.md)                                                                                                                                                                                                                 |
| Proxy hiện tại                           | [0035 — Nginx](adr/0035-nginx-reverse-proxy.md), thay lựa chọn Caddy trong ADR-0032                                                                                                                                                                                                                                                                                           |
| Triển khai và phạm vi phát hành          | [0036 — luyện deploy local](adr/0036-local-deployment.md), [0037 — phạm vi v0.1.0 là local-only, staging sang v0.2.0](adr/0037-release-scope-v0.1.0.md)                                                                                                                                                                                                                       |
| Phạm vi v0.2.0 (đã duyệt)                | [0038 — phạm vi 8 tuần](adr/0038-release-scope-v0.2.0.md), [trạng thái task](v0.2.0/status.md)                                                                                                                                                                                                                                                                                |
| Hệ thống UI v0.2.0                       | [0050 — antd sau wrapper `Ping*`](adr/0050-antd-via-ping-wrappers.md), [0051 — hướng thẩm mỹ](adr/0051-design-direction.md), [0074 — baseline visual](adr/0074-visual-regression-baselines-va-ci.md), [0075 — một nguồn token, sinh CSS](adr/0075-single-token-source-va-lop-ping.md), [0076 — skin Pixel chọn theo thiết bị](adr/0076-skin-pixel-truc-hinh-thuc-thiet-bi.md) |
| Hiệu năng tải trang                      | [0077 — unread gộp một request](adr/0077-unread-gop-mot-request.md), [0078 — hàng đợi request và Retry-After](adr/0078-hang-doi-request-va-retry-after.md), [0079 — tải tệp đính kèm lười](adr/0079-tai-tep-dinh-kem-luoi.md)                                                                                                                                                 |

## Cách đọc trạng thái và bằng chứng

- Schema/type trong `packages/shared`, migration và code là nơi kiểm chứng hành vi. Kiến trúc và quy ước
  giải thích cách sử dụng; test chứng minh các trường hợp cụ thể.
- Checklist nghiệm thu ghi tiến độ phát hành và bằng chứng theo lần kiểm. Kết quả CI cũ không chứng
  minh commit mới đã xanh; luôn đối chiếu commit trước khi gắn tag.
- ADR và báo cáo hiệu năng là bản ghi có ngày. Một quyết định có thể được ADR sau thay thế. Số đo qua
  Caddy trước đây không trở thành số đo Nginx; số đo laptop không phải sức tải production.
- Phân biệt local dev, stack production chạy local và staging. `v0.1.0` là bản **local-only**; việc chọn
  môi trường staging và phạm vi nghiệm thu tương ứng **chuyển sang `v0.2.0`** ([ADR-0037](adr/0037-release-scope-v0.1.0.md)).
  Kiểm tra Docker local chưa tự đóng mục staging.
- Chủ dự án đã xác nhận review bốn vùng nhạy cảm và **duyệt threat model** (2026-10-21).
- `known-issues.md` là ghi chú local, không được git theo dõi và không commit. Tài liệu được version hóa
  không phụ thuộc vào việc file này có tồn tại trên máy người đọc; nợ đã công bố nằm ở `tech-debt.md`.

## Duy trì tài liệu

Chạy `pnpm docs:check` và `pnpm format:check` sau khi sửa. Kiểm liên kết chỉ xác nhận đích của liên kết
Markdown tương đối có tồn tại; không kiểm nội dung lỗi thời, anchor hay URL bên ngoài.
Khi cập nhật một trạng thái, đối chiếu cả nghiệm thu, nợ kỹ thuật và runbook liên quan.

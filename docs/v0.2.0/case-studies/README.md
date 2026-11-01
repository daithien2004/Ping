# Case study v0.2.0

Chín case study, hoàn thiện tại T7.2 (2026-11-01). Theo ADR-0038: case **1, 2, 4, 5, 6, 8** đầy
đủ; case **3, 7, 9** ngắn khoảng nửa trang nhưng vẫn giữ nguồn và giới hạn đo. Chủ đề và yêu cầu
chi tiết đọc mục 8 của kế hoạch local; không tự thay chủ đề từ số case.

| Case                                     | Mức    | Nội dung                                                                                                                    | Chủ đề                                              |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [1](cs-01-presence-storm.md)             | đầy đủ | [Case 1 — Bão presence: gộp theo cửa sổ thay vì phát ngay](cs-01-presence-storm.md)                                         | Fan-out presence, cửa sổ gộp, Redis                 |
| [2](cs-02-outbox-gap-recovery.md)        | đầy đủ | [Case 2 — Dual-write, outbox và giao tin at-least-once; gap recovery ở client](cs-02-outbox-gap-recovery.md)                | Outbox, idempotency, vá thiếu bằng con trỏ tin nhắn |
| [3](cs-03-unread-multidevice.md)         | ngắn   | [Case 3 — Unread/mention đa thiết bị với đếm có trần](cs-03-unread-multidevice.md)                                          | Một truy vấn lateral, trần 100, đồng bộ tab         |
| [4](cs-04-search-acl.md)                 | đầy đủ | [Case 4 — Tìm kiếm tôn trọng quyền: FTS thay hybrid, và lỗ ACL thật](cs-04-search-acl.md)                                   | FTS scoped, lỗ ACL đã tái hiện và vá                |
| [5](cs-05-untrusted-llm.md)              | đầy đủ | [Case 5 — LLM là dependency không tin cậy](cs-05-untrusted-llm.md)                                                          | Citation guard, cache, bộ đánh giá                  |
| [6](cs-06-ops-under-20usd.md)            | đầy đủ | [Case 6 — Vận hành dưới 20 USD](cs-06-ops-under-20usd.md)                                                                   | Drill CI, restore local, phần chưa đo               |
| [7](cs-07-claude-workflow.md)            | ngắn   | [Case 7 — Quy trình Claude Code có rào chắn](cs-07-claude-workflow.md)                                                      | Hook, permissions, lint theo tầng                   |
| [8](cs-08-frontend-design-system.md)     | đầy đủ | [Case 8 — Frontend: design system token-first, `Ping*` bọc antd, hiệu năng danh sách chat](cs-08-frontend-design-system.md) | Token một nguồn, 33 wrapper, bundle, a11y           |
| [9](cs-09-upload-markdown-dm-privacy.md) | ngắn   | [Case 9 — Tệp tải lên, Markdown không XSS, DM không rò rỉ](cs-09-upload-markdown-dm-privacy.md)                             | Pipeline tệp, AST allowlist, DM theo participant    |

Dùng [mẫu](template.md) khi viết case mới. Mỗi case dẫn tới evidence và ADR có thật; số đo cần
commit/môi trường/ngày/cách chạy, và ghi rõ "chưa đo" khi thiếu — không suy ra số từ kế hoạch.

Hoàn thiện hồ sơ case **không** phải nghiệm thu sản phẩm: cổng nghiệm thu và pilot nằm ở
[acceptance/v0.2.0.md](../acceptance/v0.2.0.md), review thiết kế ở
[acceptance/design-review.md](../acceptance/design-review.md) (chờ OWNER ký).

Quy ước nội dung: không đưa dữ liệu người dùng thật hoặc tài sản thiếu giấy phép vào ảnh/demo. Câu
chuyện phải đủ rõ để OWNER giải thích quyết định và trade-off trong phỏng vấn.

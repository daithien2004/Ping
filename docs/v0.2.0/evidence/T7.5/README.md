# T7.5 — `interview-qa.md`: 45 câu hỏi/đáp

Ngày: 2026-11-01. Mục tiêu theo kế hoạch: câu hỏi dự kiến + câu trả lời ngắn cho **từng case**,
kèm "điều tôi sẽ làm khác đi", **≥ 40 câu**.

## Đã giao

[`docs/v0.2.0/interview-qa.md`](../../interview-qa.md): **45 câu**, chia 9 case + tổng quan.

| Nhóm                     | Số câu          | Nội dung chính                                                                               |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------- |
| Tổng quan                | 5               | sản phẩm là gì, vì sao tự làm, phần khó nhất, ba tính năng cốt lõi, vì sao chốt phạm vi      |
| Case 1 — presence        | 3               | số đo bão presence, batching 1 giây, trade-off độ trễ                                        |
| Case 2 — outbox          | 5               | dual-write, at-least-once, gap recovery, vì sao không có `seq`, test offline thật            |
| Case 3 — unread          | 3               | truy vấn lateral + trần 100, đồng bộ tab, bài học `aria-label`                               |
| Case 4 — search ACL      | 5               | FTS thay Elastic, tiếng Việt, lỗ ACL thật, p95, vì sao không hybrid                          |
| Case 5 — LLM             | 6               | citation guard, cache, quota/budget, bộ đánh giá, câu đúng nhưng thiếu UUID                  |
| Case 6 — vận hành        | 4               | "dưới 20 USD" chưa chứng minh, drill CI, drill ≠ RTO, restore local                          |
| Case 7 — quy trình       | 3               | hook/permissions, lint theo tầng, 68 ADR có quá nhiều                                        |
| Case 8 — frontend        | 5               | vì sao antd + 33 wrapper, bundle 248,2 KB, LCP chat, a11y, visual regression                 |
| Case 9 — tệp/Markdown/DM | 5               | pipeline tệp, không antivirus, AST allowlist, DM 404, URL ký 60 giây                         |
| Điều sẽ làm khác         | 5 gạch đầu dòng | đo đúng đơn vị, test quyền theo route, tách worker sớm, DB riêng cho demo, ghi "chưa đo" sớm |

## Kiểm chứng

| Việc             | Cách kiểm                                              | Kết quả                                            |
| ---------------- | ------------------------------------------------------ | -------------------------------------------------- |
| Đủ số câu        | `grep -cE '^\*\*[0-9]+\.' docs/v0.2.0/interview-qa.md` | **45** (yêu cầu ≥40)                               |
| Số liệu có nguồn | đối chiếu từng câu với case study/ADR tương ứng        | mọi con số lấy từ case/evidence, không thêm số mới |
| Liên kết         | `pnpm docs:check`                                      | không có liên kết hỏng                             |
| Định dạng        | `prettier --check`                                     | sạch                                               |

Đã đối chiếu lại các con số dễ sai trong lúc viết: presence 4,9 triệu event/90 giây và p95 25,3 giây;
search p95 51,3 / 8,5 / 19,9 / 1,4 ms trên 20.000 tin; cache AI 1.860 → 32 ms; 30 golden + 12
injection, bộ hồi quy 47 ca; bundle 248,2 KB gzip (8 chunk) + 74 chunk lười; LCP chat 3.556/2.948 ms;
DM 13/13 × 2, IDOR 61 endpoint; restore 561 user/146 server/27.860 tin.

## Lỗi bắt được khi viết

- Mục lục case study ghi chủ đề case 2 là "resume theo **seq**", trong khi schema không có cột `seq`
  và cơ chế thật là con trỏ `after=<messageId>` ([ADR-0044](../../../adr/0044-gap-recovery.md)).
  Đã sửa tiêu đề cột thành "vá thiếu bằng con trỏ tin nhắn" để không mâu thuẫn với case 2.
- Hai liên kết ADR sai tên file (`0023-design-tokens.md`, `0058-web-vitals-budget.md`) — `docs:check`
  bắt được, đã sửa về `0023-web-ui-kit-and-tokens.md`, `0058-bundle-budget-initial-js.md`.

## Giới hạn

- Chưa có người thứ hai đọc thử để kiểm "trả lời có hiểu không", cũng **chưa diễn tập phỏng vấn thật**.
- Các số cũ (presence, search p95, AI eval) lấy từ evidence của task trước, **không chạy lại** trong
  task này; chúng đã ghi rõ môi trường và ngày ở nguồn.
- Câu trả lời cố tình ngắn; khi phỏng vấn thật cần nói chậm hơn và có thể phải mở case study tương ứng.

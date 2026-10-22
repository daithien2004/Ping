# ADR-0038: Phạm vi v0.2.0 trong lịch 8 tuần

Status: accepted — OWNER duyệt ngày 2026-10-22
Date: 2026-10-22

## Decision

Ping v0.2.0 hướng tới một ứng dụng chat chạy trên staging công khai qua HTTPS, có khả năng
backup/khôi phục, giám sát, luồng sản phẩm hoàn chỉnh và bằng chứng kỹ thuật phục vụ phỏng vấn
fullstack. ADR này tiếp nối [ADR-0037](0037-release-scope-v0.1.0.md); không đổi phạm vi hay bằng
chứng phát hành v0.1.0 từ local thành staging.

OWNER đã duyệt bản ADR cụ thể trong phiên 2026-10-22 sau khi nhận liên kết bản đề xuất và
kết quả kiểm tra T0.1. Xác nhận này chốt phạm vi; không phải quyền merge, push hay mua dịch vụ.

### Phạm vi bắt buộc

- Độ tin cậy: cấu hình và ngân sách pool PostgreSQL, giảm bão presence, transactional outbox,
  worker, chính sách khi Redis lỗi và khôi phục khoảng trống tin nhắn sau reconnect.
- Staging: image truy nguyên commit, TLS tự gia hạn, secret ngoài repo, deploy/rollback có smoke
  HTTPS/socket, backup mã hóa ngoài máy và một lần restore vào DB mới có đối chiếu dữ liệu.
- Quản trị: server/channel/role/member, audit viewer, invite, ban/unban và category/topic/sắp xếp
  channel. Quyền do Postgres và CASL quyết định; endpoint mới có ID phải có test IDOR.
- Chat: unread/mention đồng bộ, tìm kiếm FTS, reply, reaction, ghim, Markdown an toàn, permalink,
  đính kèm ảnh/tệp, hồ sơ/avatar/icon, emoji picker, emoji tùy chỉnh, sticker và GIF.
- Người dùng: xác minh email, quên/đổi/đặt lại mật khẩu, xem/thu hồi phiên, DM 1:1 và chặn,
  thông báo và cài đặt đồng bộ nhiều thiết bị. DM không được index cho AI.
- Frontend: bộ component `Ping*`, token dùng chung, hướng Expressive Social có nhận diện riêng
  của Ping, app shell/chat/quản trị mới, landing đơn giản, sáng/tối, vi/en và responsive
  375/768/1280. Việc chuyển từ shadcn sang Ant Design và đổi nguồn token chỉ thực hiện sau ADR
  riêng và spike tương thích Next/React/SSR/CSP; ADR này chưa thay thế ADR-0023.
- AI: hỏi đáp RAG có trích dẫn, lọc quyền và hydrate lại từ Postgres trước khi đưa dữ liệu cho
  LLM, hạn mức, kill-switch ngân sách, timeout và xử lý khi nhà cung cấp lỗi mà chat vẫn dùng được.
- Hồ sơ: 6 case study đầy đủ (1, 2, 4, 5, 6, 8), 3 bản ngắn (3, 7, 9), README, demo 5 phút,
  ít nhất 25 câu hỏi/đáp phỏng vấn, pilot 2–3 ngày với 5–10 người và nghiệm thu có bằng chứng.

### Điều chỉnh cho lịch 8 tuần

Mục 6.2 của kế hoạch được ưu tiên khi các bảng khác mâu thuẫn. Toàn bộ tính năng chat mức [M]
được giữ, gồm emoji tùy chỉnh; dòng loại custom emoji khỏi phạm vi ở mục 1.3 không được áp dụng.

| Nhóm              | Mức thực hiện trong 8 tuần                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| AI                | RAG là bắt buộc; hybrid search và tóm tắt là [S]; kiểm duyệt AI là [X]                                 |
| Đánh giá AI       | Ít nhất 15 golden Q&A, test trích dẫn, prompt injection và rò rỉ quyền; ít nhất 3 metric và 1 cảnh báo |
| Giám sát          | Sentry, uptime và 3 cảnh báo: `/ready`, backup, chứng chỉ; kiểm cả trigger và recovery                 |
| Sự cố             | 3 drill: Redis chết, restart giữa tải, deploy và rollback                                              |
| Tải               | Một lượt load/reconnect trên staging từ máy khác, có kết luận và giới hạn                              |
| Visual regression | 5 màn chính × sáng/tối × 2 viewport; vẫn kiểm responsive ở 375/768/1280                                |
| Frontend          | Giữ token, `Ping*`, app shell/chat/quản trị; Storybook là [X]; axe cho màn chính                       |
| Ngoài [M]         | Chỉ làm khi sớm hơn lịch; không lấy thời gian của chat bắt buộc cho AI nâng cao                        |

Lịch dự kiến: tuần 1 chuẩn bị và độ tin cậy; tuần 2 staging; tuần 3 quản trị và nền UI/chat;
tuần 4 unread/search và tương tác tin; tuần 5 tệp/biểu cảm/hồ sơ; tuần 6 tài khoản/DM và nền AI;
tuần 7 RAG và củng cố; tuần 8 pilot/nghiệm thu. Đây là kế hoạch, chưa phải cam kết ngày phát hành.
Giả định OWNER có thể review mỗi ngày; nếu trễ quá 2 ngày, báo OWNER và áp dụng thứ tự cắt đã
chốt, không tự giảm ngưỡng nghiệm thu.

### Ngân sách, tải và dữ liệu

| Mục              | Giới hạn / mục tiêu                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Chi phí          | Trần mặc định 20 USD/tháng, gồm staging, lưu trữ, backup và AI; phân bổ cụ thể ở ADR môi trường |
| Tải pilot        | 300–500 socket đồng thời, đỉnh 20 tin/giây, server lớn nhất 500 thành viên                      |
| REST             | p95 < 300 ms                                                                                    |
| Fan-out realtime | p95 < 500 ms                                                                                    |
| Lỗi              | < 1%                                                                                            |
| Reconnect        | 500 socket, p95 phục hồi < 15 giây                                                              |
| Dữ liệu          | Chỉ demo/thử; không dùng dữ liệu người dùng thật làm fixture                                    |
| Khôi phục        | RPO ≤ 24 giờ, RTO ≤ 60 phút, phải đo thực tế                                                    |
| Backup mục tiêu  | Hằng ngày, mã hóa ngoài máy, retention 7 ngày + 4 tuần; chi tiết ở ADR backup                   |

Các ngưỡng là mục tiêu đánh giá, không phải SLA. Không dùng số đo laptop làm bằng chứng sức tải
staging. Nếu không đạt, báo cáo nút cổ chai và xin OWNER chấp nhận giới hạn; không tự hạ ngưỡng.

Chưa chọn nhà cung cấp/VPS/domain/storage/email/AI, vùng đặt, kênh cảnh báo, người trực thay thế,
danh sách pilot hay ngày phát hành. ADR môi trường sẽ chốt tài nguyên, xác minh giá/điều khoản
từ nguồn chính thức và phân bổ ngân sách trước khi đăng ký. Không tự mua dịch vụ, nhập thẻ hay
phát sinh phí chỉ vì tổng dự toán nằm trong trần. Giả định thời gian OWNER 15–20 giờ/tuần chưa
được xác nhận riêng; cần đối chiếu với lịch review và thực tế triển khai.

### Ngoài phạm vi

Voice/video/chia sẻ màn hình, mobile native, mã hóa đầu cuối, MFA, thanh toán, bot/webhook,
threads dạng forum, Kafka production, đa vùng và Kubernetes. Voice prototype, các tính năng
chat [S]/[X] và adapter/benchmark bổ sung chỉ xem xét khi mọi mục bắt buộc đã xong.

### Quy trình và cổng hoàn thành

- Một nhánh cho một task; test trước cho logic/lỗi, kiểm tra liên quan và lưu bằng chứng có commit,
  môi trường, ngày, cách chạy lại. Cập nhật [trạng thái](../v0.2.0/status.md) sau mỗi task.
- Bộ kiểm chuẩn: format, docs, lint, typecheck, test, build; thêm IDOR/e2e/a11y/bundle/migration/
  container/load theo thay đổi. Không ghi CI hoặc staging đạt khi chỉ có kết quả local.
- T0.3 tạo workflow Claude Code (hướng dẫn phân tầng, skills, subagents, hooks, commands, MCP/CI).
  Cấu hình viết được trên Codex vẫn cần chạy thử bằng Claude Code để xác nhận tương thích.
- Hai file đầu vào kế hoạch và project overview là tài liệu local theo yêu cầu OWNER, không commit
  và không tạo bản sao kế hoạch trong tài liệu version hóa. ADR, status và evidence vẫn theo dõi
  bằng Git; các liên kết bắt buộc của chúng không phụ thuộc hai file local.
- Merge, push `main`, tag/phát hành, dịch vụ trả phí và thao tác phá hủy staging cần OWNER cho phép
  rõ ràng. OWNER đã duyệt nội dung ADR này ngày 2026-10-22.

## Reason

Phạm vi ban đầu lớn hơn lịch 8 tuần. Chốt rõ phần bắt buộc, phần rút gọn và các quyết định còn
chờ giúp giữ trải nghiệm chat, an toàn dữ liệu và bằng chứng vận hành trước phần AI nâng cao.

## Alternatives considered

- Làm toàn bộ bảng task 12 tuần trong 8 tuần: rủi ro bỏ kiểm chứng và dồn quá nhiều việc tuần 5–6.
- Chỉ đưa v0.1.0 lên staging: ít việc hơn nhưng không đáp ứng mục tiêu sản phẩm và hồ sơ fullstack.
- Cắt tính năng chat bắt buộc để giữ hybrid/tóm tắt: trái thứ tự ưu tiên của kế hoạch đã chọn.

## Consequences

Lịch vẫn rất chặt; phải theo dõi phụ thuộc, khả năng review và tài nguyên thật. T0.1 chỉ chốt
phạm vi, không chốt nhà cung cấp hay chứng minh code/staging đã đạt. Các thay đổi kiến trúc tiếp
theo cần ADR riêng; bằng chứng v0.1.0 và giới hạn đã công bố được giữ nguyên.

## References

- [Phạm vi v0.1.0](0037-release-scope-v0.1.0.md), [kiến trúc](../architecture.md).
- [UI hiện tại](0023-web-ui-kit-and-tokens.md), [chất lượng frontend](0029-frontend-robustness.md).
- [Load testing](0033-load-testing.md), [tech debt](../tech-debt.md).
- [Quy trình đóng góp](../../CONTRIBUTING.md).

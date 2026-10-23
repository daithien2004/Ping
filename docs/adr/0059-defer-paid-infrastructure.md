# ADR-0059: Dời hạ tầng trả phí xuống cuối v0.2.0

Status: accepted — OWNER quyết định ngày 2026-10-23
Date: 2026-10-23

## Context

- OWNER chốt ngày 2026-10-23: **ưu tiên phần không tốn tiền**; mọi hạng mục cần chi phí
  (VPS, domain, object storage, backup ngoài máy) làm sau cùng, không chặn công việc tính năng.
- Plan §6.2 xếp Pha 2 (staging thật) vào tuần 2, trước Pha 3–5. Không có VPS/thanh toán thì
  Pha 2 không thể bắt đầu, kéo theo Pha 6 (load test từ máy khác, chaos, restore drill) và Pha 7.
- OWNER đã cung cấp **Groq** làm nhà cung cấp LLM (free tier, model `openai/gpt-oss-20b`),
  nên phần AI có thể làm ngay mà không cần ngân sách. Groq **không cung cấp embeddings**, nên
  vector hoá phải chạy cục bộ hoặc bằng free tier khác; ADR chi tiết vẫn là ADR-0046 ở T5.1.
- Ràng buộc "test ít thôi" vì free tier có hạn mức: test tự động dùng adapter giả, không gọi mạng;
  chỉ một smoke call thủ công khi cần xác nhận cấu hình.

## Decision

1. **Thứ tự thi công mới** (thay thứ tự trong plan §6.2; phạm vi không đổi):
   Pha 3 → Pha 4 → Pha G → Pha 5 (AI trên môi trường dev) → phần Pha 6 không cần staging
   (bảo mật, a11y, responsive, i18n, visual regression, bundle) → Pha 2 (VPS/TLS/backup/Sentry)
   → phần Pha 6 cần staging (load test từ máy khác, chaos, restore drill) → Pha 7.
2. **Không phát sinh chi phí trong giai đoạn code**: Qdrant chạy Docker local; embedding chạy
   cục bộ trong tiến trình (không gọi API trả phí); LLM dùng Groq free tier. Không đưa khoá Groq
   vào repo, ảnh, log hay fixture; chỉ nằm trong `.env` (đã gitignore).
3. **Không miễn trừ nghiệm thu**: các mục §12 cần staging thật (HTTPS, backup/restore, Sentry,
   load test, chaos) được **dời**, không bỏ. Tag `v0.2.0` vẫn phải chờ chúng hoàn tất.
4. Mốc thời gian không còn tính theo "tuần 2, tuần 3..." của plan; theo dõi bằng ba mốc:
   demo được → đủ nghiệm thu kỹ thuật → đủ nghiệm thu phát hành (có staging + pilot).
5. Vì Groq không có embeddings, `Embedder` là port riêng: mặc định dùng model đa ngữ cục bộ
   (ONNX), có adapter giả cho test. Số đo recall@5/độ trễ và quyết định cuối cùng ghi ở ADR-0046.

## Alternatives

- **Giữ staging ở tuần 2 và chờ thanh toán**: đúng plan chữ nhưng chặn toàn bộ Pha 3–5 trong lúc
  chờ, trái với mong muốn "ưu tiên phần miễn phí" của OWNER. Bị loại.
- **Bỏ hẳn staging/pilot khỏi v0.2.0**: rẻ và nhanh nhưng phá cổng nghiệm thu §12, không thể gọi là
  phát hành. Bị loại.
- **Dùng API embedding trả phí ngay**: vi phạm ràng buộc chi phí; chỉ xem lại nếu model cục bộ
  không đạt recall@5 ở T5.1 và OWNER duyệt ngân sách.

## Consequences

- Sản phẩm chạy được/demo được sớm hơn; rủi ro tích hợp với hạ tầng thật xuất hiện muộn hơn.
  Giảm thiểu: viết `docker-compose` production-like và runbook sớm, nhưng chỉ **chạy** ở Pha 2.
- Không có số đo load test/chaos cho tới cuối, nên case study 1 và 6 (hiệu năng, độ tin cậy) viết sau.
- Khoá Groq đã xuất hiện trong lịch sử trò chuyện: phải **xoay khoá** sau khi hoàn tất thử nghiệm,
  và không dùng lại khoá này cho staging/production.
- Free tier Groq có hạn mức request/token: mọi test phải dùng fake; lỗi hạn mức phải hiển thị
  `AI_QUOTA_EXCEEDED`/`AI_UNAVAILABLE` theo T5.7, không làm hỏng chat.

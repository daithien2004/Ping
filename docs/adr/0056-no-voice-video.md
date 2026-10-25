# ADR-0056: Không làm voice/video trong v0.2.0

Status: accepted — OWNER duyệt kèm kế hoạch TG.0 trong phiên ngày 2026-10-25
Date: 2026-10-25

## Context

Ma trận tính năng (plan 1.5) đánh dấu "Voice channel" là **Ngoài** phạm vi v0.2.0 (prototype
WebRTC ≤ 4 người là [X] — TG.21, chỉ làm khi mọi [M] xong sớm hơn lịch). Cần một ADR ghi rõ
lý do để cổng nghiệm thu có căn cứ, và để câu hỏi phỏng vấn "vì sao không có voice" có câu
trả lời có căn cứ kỹ thuật.

## Decision

**Không làm voice/video trong v0.2.0**, kể cả prototype, trừ khi toàn bộ [M] của Pha G/Pha 4/5
xong trước lịch và OWNER duyệt riêng. Lý do:

1. **Chi phí hạ tầng không vừa ngân sách 0 USD.** WebRTC cần TURN/STUN relay cho kết nối
   xuyên NAT — TURN công cộng hoặc tự dựng đều tốn băng thông lớn (âm thanh ~50 kbps/người,
   video hàng Mbps); bản free tier (Cloudflare Calls, Twilio) đều tính phí theo phút/giây.
   Text chat chạy trọn trên Postgres + Redis + Nginx có sẵn.
2. **Độ phức tạp vận hành vượt mọi giá trị demo.** Voice đòi đo jitter/packet loss, điều
   tiết chất lượng, xử lý join/leave phòng, echo cancellation — cả một mảng kỹ thuật riêng
   không chồng lấn gì các kỹ thuật cốt lõi của dự án (realtime text, phân trang cursor,
   quyền CASL, outbox, RAG).
3. **Giá trị đánh giá của Pha G nằm ở text.** Ma trận "không bị đánh giá là thiếu" tập trung
   vào tính năng chat văn bản đầy đủ (reply/reaction/ghim/markdown/đính kèm/DM/thông báo);
   làm voice sớm làm trễ chính những mục [M] này — trái nguyên tắc ưu tiên trong plan 6.1.
4. **Kiến trúc hiện tại không cản trở tương lai.** Socket.IO + Redis adapter có sẵn room
   theo channel; signaling WebRTC khi cần có thể đi qua cùng gateway; không cần quyết định
   dữ liệu nào bây giờ.

## Alternatives

- Prototype TG.21 (WebRTC mesh ≤ 4 người, không TURN): chỉ hoạt động cùng mạng LAN — demo
  không đáng tin, dễ tạo ấn tượng "hỏng" khi trình diễn.
- Dùng dịch vụ voice bên thứ ba (LiveKit, Agora): thêm dependency trả phí/dịch vụ ngoài —
  trái ADR-0059 (dời hạ tầng trả phí) và tăng bề mặt vận hành.

## Consequences

- Ma trận đánh "Voice channel: Ngoài (ADR-0056)"; TG.21 giữ [X] — chỉ cân nhắc khi mọi [M]
  xong sớm và có ngân sách TURN.
- README/threat model không cần mục voice; nếu làm sau này thì viết ADR mới về TURN và
  băng thông.
- Ước lượng Pha G giữ nguyên; thời gian tiết kiệm ưu tiên cho TG.9 (DM) và TG.12 (thông báo)
  — hai mục có tác động trải nghiệm lớn nhất còn lại.

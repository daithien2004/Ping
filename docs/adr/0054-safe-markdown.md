# ADR-0054: Markdown tập con tự parse — AST allowlist, render React trực tiếp

Status: accepted — OWNER duyệt kèm kế hoạch TG.4 trong phiên ngày 2026-10-25
Date: 2026-10-25

## Context

Tin nhắn hiện render plain-text. Người dùng kỳ vọng định dạng cơ bản (đậm/nghiêng/code/…) như
mọi ứng dụng chat. Ràng buộc an toàn: nội dung tin do người dùng sinh ra — đường render là bề
mặt XSS lớn nhất của ứng dụng; lưu **văn bản thô** (đã vậy từ đầu), chỉ client mới diễn giải.

## Decision

1. **Parser tự viết** cho tập con giới hạn (~300 dòng, thuần TS, không dependency): khối —
   đoạn văn, code block (```)…, trích dẫn (`>`), danh sách không thứ tự (`- `); inline —
   **đậm**, _nghiêng_, ~~gạch ngang~~, `code`, ||spoiler||, liên kết tự nhận, shortcode emoji,
   `@mention` token.
   _Lý do không dùng thư viện (remark/marked + sanitizer):_ các thư viện render ra HTML string
   rồi phải sanitizer một lần nữa (hai lớp dịch ngược, mỗi lớp một bề mặt CVE); tập con của ta
   cố ý nhỏ nên parser tự viết kiểm soát từng token, unit test được mọi nhánh, bundle ~0 KB
   thay vì ~30–50 KB.
2. **AST + allowlist:** parser sinh cây node có kiểu liệt kê (`Text`, `Bold`, `Italic`,
   `Strikethrough`, `InlineCode`, `CodeBlock`, `Spoiler`, `Link`, `Mention`, `Emoji`,
   `QuoteBlock`, `ListBlock`); renderer chỉ dựng element cho các kiểu này — **không có đường
   sinh HTML thô, không `dangerouslySetInnerHTML`**. Văn bản tự escape bởi React.
3. **Liên kết chỉ `http:`/`https:`** sau khi normalize lowercase scheme: mọi scheme khác
   (`javascript:`, `data:`, `vbscript:`, scheme giả mạo bằng Unicode điều khiển/zero-width
   chèn trong chuỗi scheme) → node `Text` thường. `rel="noopener noreferrer nofollow"`,
   `target="_blank"`.
4. **Nội dung trong `code`/code block không xử lý inline** — mọi cú pháp bên trong là văn
   bản thuần (điều này cũng vô hiệu hóa markdown injection lồng nhau).
5. **Emoji:** map ~60 shortcode phổ biến (`:smile:` → 😄 …) ở client; Unicode đi qua nguyên
   vẹn như text. Picker đầy đủ là TG.23.
6. **Mention hiển thị chip** theo token `@word` (heuristic client — chip đánh dấu cú pháp,
   dữ liệu mention thật đã do server parse ở T4.1 và dùng cho unread/badge).
7. **Hiệu năng:** parse là hàm thuần theo content; `MarkdownText` memo theo content; danh sách
   tin đã ảo hóa nên chỉ tin trong viewport được parse.
8. Tô màu cú pháp code block (tải lười) hoãn sang task sau — không thuộc ngưỡng an toàn.

## Alternatives

- Thư viện markdown + DOMPurify: đầy đủ cú pháp nhưng thêm 2 dependency, bundle tăng, lớp
  sanitize là lớp phòng thủ duy nhất giữa user input và DOM.
- Render HTML server-side: server trở thành bề mặt XSS, CSP phải nới — loại ngay.
- Không markdown (giữ plain-text): thiếu kỳ vọng cơ bản của app chat, matrix 1.5 đánh [M].

## Consequences

- Cú pháp mới (bảng, tiêu đề…) = viết thêm node type + test — mở rộng có kiểm soát.
- XSS: bộ test cố định (OWASP payload, scheme giả mạo, HTML lồng, Unicode) chạy trong unit
  và e2e qua UI thật; bất kỳ thay đổi parser nào phải giữ bộ này xanh.
- Spoiler cần state client (click để lộ) + nhãn aria i18n vi/en.

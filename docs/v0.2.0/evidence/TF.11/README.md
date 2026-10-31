# Evidence TF.11 — UI hỏi AI: ngăn kéo, stream văn bản thuần, trích dẫn, skeleton, lỗi, hủy

- Ngày: 2026-10-31 (Asia/Saigon); nhánh `feat/batch1-t65-tf11-tf12`; base `132acfb` (main sau TG.10).
- Không cần ADR mới: hoàn thiện UI trên hợp đồng SSE và guardrails đã chốt ở T5.6 (ADR-0048 +
  quota/chi phí); không đổi dữ liệu hay API.

## Đã giao

`apps/web/src/features/messages/components/ask-dialog.tsx`:

- **Ngăn kéo thay hộp thoại:** dùng `PingDrawer` (rộng 460) trượt từ phải, giữ nguyên nút «Hỏi»
  trên header kênh. Ngăn kéo cao hơn hộp thoại cũ nên câu trả lời dài không bị cắt.
- **Văn bản thuần, fail-closed:** chỉ render câu trả lời khi nhận đủ sự kiện `done`; không render
  Markdown/HTML từ model (`whitespace-pre-wrap`). Stream đóng mà thiếu `done` → hiện lỗi
  «không có trích dẫn hợp lệ» và **không** hiển thị phần văn bản đã nhận.
- **Trích dẫn:** chip `ask-citation-<messageId>` dưới nhãn «Nguồn»; bấm gọi `onCitationClick`
  để nhảy tới tin gốc (kèm `channelId` đang hỏi).
- **Trạng thái chờ:** spinner + «Đang hỏi…» trong vùng `role="status"`; thẻ skeleton giữ chỗ được
  `aria-hidden` để trình đọc màn hình không đọc nội dung giả.
- **`aria-live`:** vùng chứa câu trả lời có `aria-live="polite" aria-atomic="true"` nên trình đọc
  màn hình đọc một lần khi có kết quả thay vì từng delta.
- **Lỗi theo mã:** `AI_INSUFFICIENT_CONTEXT`, `AI_NO_CITATION`, `AI_UNAVAILABLE`,
  `AI_RETRIEVAL_FAILED`, `AI_INVALID_QUESTION`, `AI_QUOTA_EXCEEDED`, `AI_BUDGET_EXHAUSTED` có câu
  riêng (vi/en); mã lạ rơi về câu chung. Hiển thị bằng `PingAlert` (`role="alert"`).
- **Hủy:** `AbortController` cho mỗi lượt hỏi; nút «Hủy», đóng ngăn kéo, Esc hay bấm nền đều hủy
  request và reset trạng thái — không còn delta nào chạm state sau đó.

## Kiểm chứng

Test `apps/web/e2e/ask.spec.ts` chặn đúng route `POST /servers/*/ask` để tự quyết định nội dung
SSE (không gọi LLM thật), còn auth/quyền/kênh chạy trên API thật:

- Ca 1: hiện «Đang hỏi…» + skeleton + nút Hủy → stream 2 delta → câu trả lời đầy đủ trong vùng
  `aria-live`, chip trích dẫn đúng ID, skeleton biến mất.
- Ca 2: SSE `error` mã `AI_QUOTA_EXCEEDED` → đúng câu lỗi quota, không hiện câu trả lời; hủy giữa
  chừng → skeleton biến mất, không lộ câu trả lời/lỗi cũ.

| Hạng mục              | Kết quả                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web e2e `ask`         | **2/2** (`ask.spec.ts`, ~39 s)                                                                                                                                                                                                                                                                                                                                             |
| Axe trên ngăn kéo     | **4 lượt quét** (trả lời + lỗi, nền sáng + tối) với `include('[role="dialog"]')`: **0 vi phạm** WCAG 2.0/2.1 A/AA                                                                                                                                                                                                                                                          |
| Web unit              | **271/271** (31 file)                                                                                                                                                                                                                                                                                                                                                      |
| Web e2e toàn bộ       | `E2E_PRODUCTION=1`: **55 pass + 1 skip + 2 fail** (17,9 phút). `admin-invite` đỏ do locator «Mã mời» không giới hạn dialog (sidebar cũng có nút «Sao chép mã mời» — race có sẵn từ TF.10); đã scope vào `[role="dialog"]` và **pass solo**. `unread-ui` hết 20 s chờ `/unread` do chạm 100 req/phút/IP khi chạy cả bộ ở local (tiền lệ TG.1/TG.10) — **pass solo 14,5 s**. |
| Typecheck/lint/format | typecheck 4/4; lint 0 error (14 warning `<img>` có sẵn); `format:check` sạch                                                                                                                                                                                                                                                                                               |
| Bundle                | **248,2 KB gzip** (≤ 450 KB) — không thêm phụ thuộc mới cho TF.11                                                                                                                                                                                                                                                                                                          |
| Ảnh                   | `ask-drawer-asking.png`, `ask-drawer-answer.png`, `ask-drawer-error.png`                                                                                                                                                                                                                                                                                                   |

## Sửa kèm khi chạy gate

- **Tương phản nút nguy hiểm ở nền tối:** axe bắt `color-contrast` (serious) trên nút «Thu hồi»
  của danh sách phiên (TG.13) ở nền tối — chữ trắng trên `red-400` chỉ ~2,7:1. `PingButton`
  chuyển variant `danger` sang kiểu viền (`type="default"` + `danger`), chữ đỏ trên nền card đạt
  ~5,8:1 (tối) / ~4,7:1 (sáng), đồng thời hợp phong cách tối giản. Toàn bộ 9 chỗ dùng
  `variant="danger"` đều là hành động phá hủy nên đổi đồng loạt.
- **Nhãn đóng của antd theo locale (TF.12):** Modal/Drawer của antd dùng `vi_VN` nên nút đóng có
  tên «Đóng» thay vì «Close»; `profile.spec.ts` cập nhật theo (trước đó treo tới hết timeout vì
  `locator.click()` không có action timeout).

## Lưu ý

- Nội dung SSE trong test là giả lập có chủ đích: TF.11 kiểm tra UI, không kiểm tra chất lượng
  câu trả lời của model (đã có ca riêng ở API e2e với provider giả).
- Ngăn kéo reset câu trả lời mỗi lần đóng; lịch sử hỏi chưa được lưu (ngoài phạm vi TF.11).

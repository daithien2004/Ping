# Evidence T6.9 — A11y màn mới, bàn phím, aria-live

- Ngày: 2026-11-01 (Asia/Saigon); nhánh `feat/batch2-t67-t610`; base `5819507`.
- Không cần ADR mới: làm theo ADR-0029 (a11y, cấm `autoFocus`) và bộ axe WCAG 2.0/2.1 A+AA đã
  dùng từ TF.9; phần focus modal ghi chú tại chỗ trong code.

## Đã giao

**Mở rộng `apps/web/e2e/a11y.spec.ts` (4 test, quét axe `wcag2a/wcag2aa/wcag21a/wcag21aa`):**

- App shell + màn mới: khẳng định `message-announcer` và `mention-announcer` có
  `aria-live="polite"`; quét quick switcher sáng/tối (chỉ `[role="dialog"]` sau khi đợi animation
  hữu hạn xong), admin `/servers/:id/settings`, drawer chung ở 375 (mở bằng `mobile-nav-toggle`,
  Esc đóng) và shell 768, hội thoại DM (tạo thật qua API: partner mới join server rồi get-or-create).
- Giữ nguyên các lượt quét cũ: đăng nhập/đăng ký, trạng thái lỗi, shell + menu tin nhắn + dialog
  tạo server, 6 mục cài đặt cá nhân (TG.13).

**Lỗi thật bắt được và đã vá (không phải false positive):**

1. **Focus quick switcher**: `useEffect` + `ref` object không focus được vì antd mount nội dung
   modal qua Portal ở commit sau → `ref` còn `null` khi effect chạy, sau đó focus-lock của panel
   nhảy vào nút đóng. Vá bằng callback ref ổn định (`useCallback`) trong
   `components/quick-switcher.tsx` và `features/search/components/search-modal.tsx`; e2e khẳng
   định `toBeFocused()` ngay sau khi mở.
2. **Contrast mô tả `PingEmpty`** (nền sáng, bảng vai trò): `colorTextDescription` của antd pha
   alpha ~45% → dưới 4,5:1. Ghim `colorTextDescription` về `mutedForeground`.
3. **Contrast nút "danger" nền tối** (Thu hồi phiên): antd suy `palette[6]` từ seed #f07a6a thành
   #cf6b5d (~4,4:1 trên card). Ghim `Button.colorError` về destructive (5,8:1 tối).
4. `lightColors.mutedForeground` (ink-500, 4,18:1 trên trắng) nâng lên ink-550 (4,89:1) — ảnh
   hưởng mọi chữ phụ nền sáng.

**Bàn phím / aria-live đã kiểm:**

- `e2e/quick-switcher.spec.ts`: Ctrl+K mở, ô nhập **focused**, `role="combobox"` +
  `aria-expanded`/`aria-activedescendant`, Arrow đổi lựa chọn, Enter điều hướng, mở lại thì ô
  trống, Esc đóng.
- `e2e/responsive.spec.ts`: drawer 375 đóng bằng Esc và **trả focus** về nút mở.
- `aria-live` của luồng AI nằm trong `ask-drawer.tsx` (`data-testid="ask-live"`), đã có e2e ask
  từ TF.11; announcer tin nhắn/mention là vùng `sr-only` có `aria-live="polite"` + `aria-atomic`.

## Kết quả

| Hạng mục                              | Kết quả                                    |
| ------------------------------------- | ------------------------------------------ |
| `e2e/a11y.spec.ts` (production build) | **4/4 pass**, 1,2 phút                     |
| `e2e/quick-switcher.spec.ts`          | **1/1 pass** (8,1 s)                       |
| `e2e/responsive.spec.ts`              | **4/4 pass** (bàn phím drawer + trả focus) |
| Vi phạm axe còn lại                   | **0** ở mọi lượt quét của spec trên        |
| Lighthouse accessibility (local)      | **100** (xem T6.10)                        |

## Giới hạn

- axe không thay được screen reader thật; chưa thử NVDA/VoiceOver (pilot T7).
- Vùng `aria-live` của unread chỉ khẳng định thuộc tính + có announcer; nội dung đọc phụ thuộc
  trình đọc màn hình.

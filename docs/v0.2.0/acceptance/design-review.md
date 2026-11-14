# Cổng review thiết kế v0.2.0 (TF.14)

Trạng thái: **chờ OWNER ký** — ngày rà 2026-11-01 (Asia/Saigon), nhánh
`feat/batch3-tf13-tf15-t7`, base `3ed2ff4` (main sau lô 2).
Phạm vi: toàn bộ web v0.2.0 (landing, đăng nhập/đăng ký, app shell chat/DM, tìm kiếm, quản trị
server, hỏi AI, cài đặt cá nhân), sáng/tối, 375/768/1280.
Hướng thiết kế: [ADR-0051](../../adr/0051-design-direction.md), token ở
[`apps/web/src/lib/theme/tokens.ts`](../../../apps/web/src/lib/theme/tokens.ts) và
[`apps/web/src/app/globals.css`](../../../apps/web/src/app/globals.css).

## 1. Cách đo

| Nguồn                               | Dùng cho                                                                | Chạy lại                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/scripts/design-audit.mjs` | lưới 4 px, thang chữ/radius/motion, tương phản WCAG, quét hex/antd/icon | `node apps/web/scripts/design-audit.mjs` → [audit.txt](../evidence/TF.14/audit.txt) |
| `apps/web/e2e/a11y.spec.ts`         | axe WCAG 2.0/2.1 A+AA trên màn chính, sáng + tối                        | `pnpm --filter web test:e2e -- a11y` (cần API + DB + Redis)                         |
| `apps/web/visual`                   | 6 màn × sáng/tối × 3 viewport, so pixel                                 | `pnpm --filter web test:visual` ([TF.13](../evidence/TF.13/README.md))              |
| `apps/web/scripts/measure-perf.mjs` | LCP/CLS/INP thực đo trên landing + chat                                 | [TF.15](../evidence/TF.15/README.md)                                                |
| Rà mắt trên build production        | copy, thứ bậc thị giác, trạng thái, biểu tượng                          | ảnh ở [before/after](../evidence/TF.14/README.md)                                   |

Số liệu dưới đây lấy từ lần chạy 2026-11-01 trên Windows (production build, seed cố định). CI
Linux so với bộ baseline Linux riêng — xem giới hạn W3.

## 2. Checklist

### 2.1 Lưới 4/8 px — **đạt**

- Thang `spacing` trong `tokens.ts`: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px —
  **toàn bộ là bội số của 4**, không có giá trị lẻ.
- Thang chữ 12 / 14 / 16 / 18 / 20 / 24 px; giãn dòng 1.2 / 1.5 / 1.7.
- Quét toàn bộ `src/` (284 file): 5 giá trị ngoài thang, đều có lý do và đã ghi thành ngoại lệ W4:
  - `w-[72px]` — bề rộng rail, đúng hướng thiết kế (72 px).
  - `rounded-[2px]` — mũi nhọn tooltip, chi tiết trang trí.
  - `text-[0.8rem]` — mặc định của shadcn cho nút `size="sm"` (12,8 px).
  - `text-[10px]` / `text-[11px]` — nhãn cực nhỏ trong rail 72 px và dòng ghi công Tenor.

### 2.2 Tương phản AA — **đạt** (đã sửa 1 lỗi thật)

Đo bằng WCAG 2.1 (công thức độ sáng tương đối, OKLCH → sRGB) trên token thật:

| Bộ token  | Cặp thấp nhất                                                   | Tỉ lệ      | Ngưỡng |
| --------- | --------------------------------------------------------------- | ---------- | ------ |
| CSS sáng  | `--link` / `--background`, `--primary-foreground` / `--primary` | **5,23:1** | 4,5:1  |
| CSS tối   | `--primary-foreground` / `--primary`                            | **5,23:1** | 4,5:1  |
| antd sáng | `destructive` / `card`                                          | **4,65:1** | 4,5:1  |
| antd tối  | `primaryForeground` / `primary`                                 | **5,13:1** | 4,5:1  |

- **Lỗi tìm thấy và đã sửa:** `darkColors.primary` dùng violet-500 — chữ trắng chỉ đạt
  **4,35:1** (dưới AA cho chữ thường), trong khi `--primary` của CSS ở nền tối đã là violet-600.
  Đổi `darkColors.primary` sang violet-600: **5,13:1**, và hai nguồn token khớp nhau.
- Chỉ báo focus `--ring` trên nền: 3,87:1 (sáng) / 4,20:1 (tối) — đạt ngưỡng 3:1 cho thành phần
  giao diện.
- axe WCAG 2.0/2.1 A+AA: **4/4 lượt quét pass, 0 vi phạm** ([T6.9](../evidence/T6.9/README.md));
  chạy lại trong full gate cuối lô.
- Ngoại lệ W1: viền ô nhập/đường phân cách dưới 3:1 (1,35–2,98:1). Xem mục 4.

### 2.3 Bán kính và đổ bóng nhất quán — **đạt có ghi chú**

- Bán kính: `radius` = 6 / 8 / 12 / 16 px (+ `full`), antd dùng đúng thang này cho Button,
  Input, Card, Modal.
- Lớp Tailwind (`rounded-*`) suy từ `--radius: 0.5rem`: sm 4,8 / md 6,4 / lg 8 / xl 11,2 /
  2xl 14,4 / 3xl 17,6 px. Đây là thang gốc của shadcn, **lệch tên một bậc** so với token nhưng
  giá trị nằm trong cùng dải 4,8–17,6 px; `rounded-3xl` (17,6 px) chỉ dùng cho ô server 48 px để
  tạo squircle. Không có màn nào trộn hai giá trị lân cận trên cùng một bề mặt.
- Đổ bóng theo tầng: `shadow-xs` cho thanh tiêu đề dính (4 chỗ), `shadow-sm` cho popover nhỏ
  trong composer (1), `shadow-md` cho popover nổi (3), `shadow-xl` cho drawer/panel trượt (5).
  Không có bóng ngoài thang.

### 2.4 Không layout shift — **đạt**

- CLS đo lab ([TF.15](../evidence/TF.15/README.md)): landing **0**, chat **0,0289** (ngưỡng tốt
  ≤ 0,1).
- Danh sách dùng skeleton giữ đúng chiều cao khung (`RailSkeleton`, `SidebarSkeleton`,
  `MessageListSkeleton`); `<img>` đều có khung/kích thước cố định hoặc `aspect-*` nên không đẩy
  nội dung.
- Ảnh visual regression ổn định qua 2 lần chạy production liên tiếp.

### 2.5 Đủ hover / focus-visible / active / disabled — **đạt**

- 21 file dùng `hover:`, 44 file có `disabled`/`disabled:`, focus-visible phủ ở primitive shadcn,
  rail server, member panel, channel nav và các picker.
- `PingButton` có `loading` + `disabled` kế thừa antd; `PingIconButton` bắt buộc `aria-label`.
- `disabled:pointer-events-none disabled:opacity-50` ở primitive; antd tự xử lý trạng thái nút.
- Motion ≤ 200 ms (`fast` 120, `normal`/`slow` 200) và toàn cục tắt animation/transition khi
  `prefers-reduced-motion: reduce` (`app/globals.css`).

### 2.6 Biểu tượng đồng bộ — **đạt**

- 32 file import `lucide-react`; **0** import `react-icons`, `@ant-design/icons` hay bộ icon khác.
- Icon trang trí đặt trong nút có nhãn; icon đứng một mình đi qua `PingIconButton` (bắt buộc
  `aria-label`).

### 2.7 Copy tiếng Việt tự nhiên — **đạt**

- `messages/vi.json` và `en.json`: **668 / 668 khoá**, test parity `src/i18n/messages.test.ts`
  chặn lệch khoá.
- antd và dayjs dùng locale `vi` (kiểm chứng TF.12); mọi nhãn mới của v0.2.0 đã dịch, không còn
  nhãn tiếng Anh cứng (ví dụ `code` → «Khối mã» ở T6.7).
- Câu trạng thái theo quy ước [states.md](../../design/states.md): nói rõ chuyện gì + bước tiếp
  theo, không dùng «Không có dữ liệu».

### 2.8 Mọi màn đủ trạng thái — **đạt**

| Màn                       | Loading                     | Empty                                         | Error                                | Bằng chứng                               |
| ------------------------- | --------------------------- | --------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Đăng nhập/đăng ký         | —                           | —                                             | boundary `(auth)/error.tsx` + mã lỗi | [TF.9](../evidence/TF.9/README.md)       |
| Khung chat                | `MessageListSkeleton`       | «Gửi tin đầu tiên»                            | `(app)/error.tsx` + thử lại          | TF.9, [T6.7](../evidence/T6.7/README.md) |
| Danh sách channel         | `SidebarSkeleton`           | «Tạo channel» / «Server chưa có channel nào.» | inline ở footer                      | TF.9                                     |
| Panel thành viên          | skeleton                    | «Chưa có thành viên nào.»                     | `role="alert"` + thử lại             | TF.9                                     |
| Tìm kiếm / quick switcher | —                           | `PingEmpty` «Không tìm thấy»                  | —                                    | TF.9, T6.9                               |
| Quản trị server           | —                           | bảng vai trò dùng `PingEmpty`                 | alert + thử lại                      | T6.7                                     |
| Hỏi AI                    | trạng thái chờ trong drawer | —                                             | lỗi + hủy, `aria-live`               | [TF.11](../evidence/TF.11/README.md)     |
| Cài đặt cá nhân           | —                           | —                                             | alert + thử lại, toast lỗi mutation  | T6.7, T6.9                               |
| 404                       | —                           | —                                             | thông điệp + «Về trang chủ»          | TF.9                                     |

### 2.9 Sáng/tối, responsive, visual — **đạt**

- Sáng/tối: cùng bộ token nghĩa, không hard-code màu; ảnh visual phủ cả hai.
- Responsive 375/768/1280 + drawer/window-split (ADR-0073), e2e `responsive.spec` 4/4 pass.
- Visual regression: 36 baseline (6 màn × 2 chế độ × 3 viewport), 12/12 test pass hai lần liền
  ([TF.13](../evidence/TF.13/README.md)).

## 3. Gói ảnh trước/sau

Ảnh nằm ở [evidence/TF.14](../evidence/TF.14/README.md) (`before/` + `after/`):

| Màn        | Trước (TF.9, 2026-10-22)                                                  | Sau (TF.13, 2026-11-01)          | Nhận xét                                                         |
| ---------- | ------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Đăng nhập  | `before/01-login.png`                                                     | `after/login-light-1280x800.png` | Cùng bố cục; sau có token sáng hoàn chỉnh, focus ring rõ hơn     |
| Khung chat | `before/12-chat-light.png`                                                | `after/chat-light-1280x800.png`  | Thêm category, topic, trạng thái skeleton rõ; mật độ đọc tốt hơn |
| Trạng thái | `before/03-empty-channel.png`, `08-channel-empty.png`, `11-not-found.png` | —                                | TF.9 vẫn là ảnh chuẩn trạng thái; không đổi sau polish           |
| Tìm kiếm   | không có (màn mới)                                                        | `after/search-light-375x812.png` | —                                                                |
| Quản trị   | không có (màn mới)                                                        | `after/admin-dark-1280x800.png`  | —                                                                |
| Hỏi AI     | không có (màn mới)                                                        | `after/ask-dark-375x812.png`     | —                                                                |

Màn tìm kiếm/quản trị/AI chỉ có từ v0.2.0 nên không có ảnh «trước»; T6.7 đã ghi rõ điều này.

## 4. Ngoại lệ và giới hạn cần OWNER biết

| Mã  | Nội dung                                                                                                                                                | Ảnh hưởng                                                   | Đề xuất                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| W1  | Viền ô nhập/đường phân cách dưới 3:1 (WCAG 1.4.11 non-text): `--border` 1,35:1 sáng / 2,32:1 tối; `--input` 1,35 / 2,98; antd `border/card` 1,44 / 1,29 | Ranh giới ô nhập dựa vào viền; axe không kiểm luật này      | Chấp nhận cho v0.2.0 (viền mảnh là chủ ý thị giác) hoặc bổ sung token viền đậm riêng cho input ở vòng sau |
| W2  | axe không thay được trình đọc màn hình; chưa thử NVDA/VoiceOver                                                                                         | a11y thực nghiệm                                            | Thử trong pilot (T7.1)                                                                                    |
| W3  | Baseline visual tách theo hệ điều hành (DirectWrite/FreeType), dung sai `threshold 0.3` + 1,5% điểm ảnh                                                 | Đã có bộ Linux 36 ảnh (`3eda1a2`); còn chờ run so sánh thật | Chấp nhận như ADR-0074                                                                                    |
| W4  | 5 giá trị ngoài thang: rail 72 px, mũi tooltip 2 px, shadcn `0.8rem`, nhãn 10/11 px                                                                     | Cỡ chữ 10/11 px dưới thang 12 px                            | Giữ vì nằm trong rail 72 px / dòng ghi công; gộp vào thang khi sửa các màn đó                             |

Không có ngoại lệ nào về token màu, `!important`, import antd sai chỗ hay icon ngoài lucide.

## 5. OWNER ký

- Quyết định: ☐ Đạt ☐ Đạt kèm ngoại lệ W1–W4 ☐ Không đạt
- Họ tên: ______________________
- Ngày: ______________________
- Commit/branch: ______________________
- Ghi chú: ____________________________________________________________

Chưa ký thì cổng TF.14 vẫn **chưa nghiệm thu**; các mục trên chỉ là kết quả rà tự động + rà mắt.

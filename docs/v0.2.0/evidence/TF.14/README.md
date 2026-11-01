# Evidence TF.14 — Cổng review thiết kế

- Ngày: 2026-11-01 (Asia/Saigon); nhánh `feat/batch3-tf13-tf15-t7`; base `3ed2ff4` (main sau lô 2).
- Deliverable chính: [acceptance/design-review.md](../../acceptance/design-review.md) — **chờ OWNER ký**.
- Không cần ADR mới: rà trên token ADR-0051 và quy ước trạng thái `docs/design/states.md`; thay đổi
  duy nhất là chỉnh một giá trị token về đúng ngưỡng AA đã tuyên bố.

## Đã giao

**`apps/web/scripts/design-audit.mjs`** — audit tĩnh, chỉ đọc:

- Đọc token thật: `spacing`/`radius`/`typography`/`motion` từ `src/lib/theme/tokens.ts`; bảng màu
  oklch + token nghĩa sáng/tối từ `src/app/globals.css`; token antd (hex) từ `tokens.ts`.
- Tính tương phản WCAG 2.1 (OKLCH → sRGB → độ sáng tương đối, có composite alpha) cho 14 cặp chữ
  CSS, 4 cặp phi chữ CSS và 7 cặp token antd, ở cả hai chế độ.
- Kiểm lưới 4 px, thang chữ, trần motion 200 ms.
- Quét 284 file: hex ngoài token, `!important` ngoài `globals.css`, giá trị px/rem tuỳ ý, import
  `antd` ngoài `components/ui|lib/theme|providers`, icon ngoài `lucide-react`.

Kết quả đầy đủ: [audit.txt](audit.txt) (chạy 2026-11-01, Windows).

**Lỗi thật tìm thấy và đã sửa:**

- `darkColors.primary` = violet-500 → chữ trắng trên nút chỉ **4,35:1**, dưới AA cho chữ thường.
  `globals.css` ở nền tối đã dùng violet-600, nên hai nguồn token lệch nhau. Đổi về violet-600:
  **5,13:1**, khớp CSS.
- Đã rebuild production và sinh lại 36 baseline visual: 18 ảnh nền tối **không đổi một pixel**
  (các màn được chụp không có nút primary antd), nên không phát sinh baseline mới.

**Gói ảnh trước/sau** (dùng cho case study FE):

- `before/` — 5 ảnh chuẩn trạng thái TF.9 (2026-10-22): đăng nhập, chat sáng, channel rỗng ×2, 404.
- `after/` — 5 ảnh TF.13 (production, 2026-11-01): đăng nhập sáng, chat sáng, tìm kiếm 375, quản trị
  tối 1280, hỏi AI 375.
- Màn tìm kiếm/quản trị/AI mới có từ v0.2.0 nên không có ảnh «trước»; bảng đối chiếu nằm trong
  [design-review.md](../../acceptance/design-review.md) mục 3.

## Kết quả

| Hạng mục                    | Kết quả                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Lưới 4/8 px                 | Toàn bộ thang spacing là bội số 4; 5 ngoại lệ có lý do (W4)                             |
| Tương phản chữ AA           | 18/18 cặp đạt; thấp nhất 4,65:1 (antd sáng `destructive/card`)                          |
| Tương phản phi chữ          | `--ring` 3,87:1 / 4,20:1 đạt; viền ô nhập dưới 3:1 — ngoại lệ W1                        |
| axe WCAG 2.0/2.1 A+AA       | 0 vi phạm ở 4/4 lượt quét ([T6.9](../T6.9/README.md)); chạy lại ở full gate             |
| Radius/shadow               | antd 6/8/12/16 px; Tailwind 4,8–17,6 px (shadcn), bóng theo 4 tầng                      |
| Layout shift                | CLS 0 (landing) / 0,0289 (chat) — [TF.15](../TF.15/README.md)                           |
| Trạng thái                  | Loading/empty/error/toast phủ đủ bảng màn hình — [states.md](../../../design/states.md) |
| Icon                        | 32 file `lucide-react`, 0 bộ icon khác                                                  |
| Copy vi/en                  | 668/668 khoá, parity test; antd/dayjs locale vi (TF.12)                                 |
| Hex/antd/!important sai chỗ | 0 vi phạm                                                                               |
| Visual regression           | 36 baseline win32; 12/12 pass hai lần liền ([TF.13](../TF.13/README.md))                |

## Giới hạn

- Audit tĩnh không thay rà mắt/browser thật; phần copy và thứ bậc thị giác rà trên ảnh production.
- axe không thay trình đọc màn hình, chưa thử NVDA/VoiceOver (W2 — pilot T7.1).
- Viền ô nhập dưới 3:1 (WCAG 1.4.11) chưa sửa; chờ OWNER quyết ở W1.
- Baseline visual tách theo hệ điều hành; CI Linux dùng bộ ảnh Linux riêng (W3, ADR-0074).

## Chạy lại

```bash
node apps/web/scripts/design-audit.mjs                 # báo cáo audit tĩnh
pnpm --filter web test:e2e -- a11y                     # axe (cần API + DB + Redis)
pnpm --filter web test:visual                          # 36 baseline (tự build production)
```

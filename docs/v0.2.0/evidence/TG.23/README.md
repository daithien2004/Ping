# Evidence `TG.23` — `Emoji picker đầy đủ (ADR-0057): nhóm, tìm kiếm vi/en, gần đây, tông da`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên (font hệ thống + dataset
  vi/en + gợi ý `:ten:` + emoji lớn).
- Task, nhánh: TG.23 — `feat/tg23-emoji-picker` (PR nháp local); base = main sau TG.4.
- Môi trường: Windows, Docker Desktop 28.5.1, Playwright 1.63.

## Thay đổi

- **ADR-0057** (`docs/adr/0057-system-font-emoji.md`, accepted): hình emoji do **font hệ
  thống** render — bundle 0 KB, không vướng giấy phép; trade-off: hình khác nhau giữa OS.
- **`features/emoji/map.ts`** (mới, nhẹ — vào bundle ban đầu): `SHORTCODE_TO_UNICODE` 276 cặp
  — **nguồn duy nhất** của cặp shortcode↔emoji; `markdown.ts` (TG.4) bỏ map 59 entry local,
  import từ đây (dataset mất nhất quán khi markdown map 59 thiếu shortcode mới — test bắt).
- **`features/emoji/data.ts`** (276 emoji, lazy): 8 nhóm, từ khóa tìm kiếm vi/en, cờ `tone`.
- **`EmojiPicker`** (lazy qua `next/dynamic`): tab nhóm + Gần đây (localStorage 24), tìm kiếm
  không dấu (foldVi: NFD + bỏ dấu + đ→d — "cuoi" trúng "cười"), tông da Fitzpatrick (5
  modifier), lưới `<button role="gridcell">` điều hướng mũi tên, Enter chọn.
- **Composer:** nút emoji mở picker (đóng sau chọn), chèn tại vị trí con trỏ; **gợi ý
  `:ten:`** — gõ `:abc` hiện listbox 5 gợi ý (dataset tải động lần đầu gõ `:`), mũi tên +
  Enter/Tab chọn, Esc hủy; chèn dạng `:shortcode:` render qua map TG.4.
- **Emoji lớn:** tin chỉ toàn emoji (1–3, không chữ/số/cú pháp) render `text-4xl` +
  `data-testid="big-emoji"`. Lỗi thiết kế bắt khi làm: parser chỉ tạo node `emoji` từ
  **shortcode** — emoji Unicode literal là text; đổi `bigEmojiCount` đếm trực tiếp
  `\p{Extended_Pictographic}` trên chuỗi gốc.
- i18n namespace `emoji` vi/en.

## Kiểm chứng

| Tiêu chí                         | Cách thử                                                                                                                                                                              | Kết quả                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dữ liệu nhất quán                | unit `data.test.ts`: shortcode/unicode không trùng; map.ts ↔ EMOJI_DATA khớp 1-1; mọi shortcode TG.4 còn hợp lệ; tìm "cười" trúng smile/joy/laughing/blush; tone không nhúng modifier | **6/6 pass**                                                                                                                                                                                                                  |
| Picker + tìm không dấu + Gần đây | web e2e `emoji.spec.ts` (mới): mở picker, tìm "cuoi" có kết quả, chọn → composer; Gần đây nhớ emoji vừa chọn                                                                          | pass                                                                                                                                                                                                                          |
| Gợi ý `:ten:`                    | e2e: gõ ":fir" → listbox hiện, Enter chèn `:xxx:`; gửi → emoji render qua map                                                                                                         | pass                                                                                                                                                                                                                          |
| Emoji lớn                        | e2e: "😄 😄 😄" → `big-emoji`; "xin chào 😄" → không                                                                                                                                  | pass                                                                                                                                                                                                                          |
| Bundle ban đầu không tăng        | `check:bundle`                                                                                                                                                                        | **244.0 KB** (≤ 450) — dataset + picker ở chunk lazy                                                                                                                                                                          |
| Hồi quy                          | web unit **177** (171 + 6), API e2e, web e2e full                                                                                                                                     | API e2e **188/188** (redis-outage 429 do Redis giữ state run cũ — FLUSHDB rồi pass; một run lỗi do API tàn hợp `dist/main` — bài học dọn process); web e2e **32 pass + 1 flake admin-invite (pass khi rerun, đã ghi ở TG.4)** |
| Bộ chuẩn                         | lint/typecheck/format/docs                                                                                                                                                            | pass                                                                                                                                                                                                                          |

Chạy lại: `pnpm --filter web exec vitest run src/features/emoji/data.test.ts`;
`WEB_PORT=3110 pnpm --filter web exec playwright test e2e/emoji.spec.ts`.

## Phát hiện khi làm

- **map.ts tách từ dataset**: markdown map 59 entry của TG.4 thiếu nhiều shortcode dataset
  mới có (gold_medal, tired_face…) — tin dùng gợi ý chèn `:gold_medal:` render ra text thay
  emoji. Tách map nhẹ thành nguồn duy nhất + test bắt khớp data.ts.
- Dataset dính 1 entry viết nhiều dòng (prettier format) làm regex đếm nhầm 275/276 — chuẩn
  hóa 1 dòng.
- `no-misleading-character-class`: character class chứa VS16/combining (ký tự vô hình) bị
  cấm — đổi sang kiểm "không chữ/số/cú pháp" trên phần còn lại.
- **Vận hành:** API tàn hợp build `dist/main` (không phải `nest start:dev`) sống qua nhiều
  run e2e làm web SSR "Network error" — nhận diện bằng CommandLine, kill trước khi chạy.
  Redis giữ rate-limit state giữa các run: `redis-cli FLUSHDB` trước redis-outage spec.

## Giới hạn và tiếp theo

- Hình emoji khác nhau giữa OS (ADR-0057 trade-off); emoji mới nhất có thể ô vuông trên OS cũ.
- Tìm kiếm chỉ khớp từ khóa chứa chuỗi (startsWith shortcode / includes keyword) — không
  fuzzy; đủ cho pilot.
- Kế tiếp theo lịch: TG.1 (reply) → TG.5 (permalink) → TG.2 (reaction — tái dùng picker).

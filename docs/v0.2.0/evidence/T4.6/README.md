# Evidence `T4.6` — `ADR-0045 + FTS + endpoint search + UI; p95 trên seed lớn`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên cùng ngày.
- Task, nhánh: T4.6 — `feat/t4.6-search` (PR nháp local); kế hoạch local `docs/ping-v0.2.0-plan.md`
  (không commit); base = main sau T4.5.
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres 18.local có sẵn unaccent 1.1 + pg_trgm 1.6),
  Playwright 1.63.

## Thay đổi

- **ADR-0045** (`docs/adr/0045-full-text-search.md`, accepted theo duyệt kế hoạch).
- **Migration `20261025042012_fts_search`**: `CREATE EXTENSION unaccent/pg_trgm`; hàm
  **`f_unaccent(text)` IMMUTABLE** (schema-qualify `public.unaccent('public.unaccent'::regdictionary, $1)`
  — bắt buộc vì inlining làm mất search_path); cột sinh
  `Message.search tsvector = to_tsvector('simple', f_unaccent(content))` + GIN; GIN trigram trên
  `f_unaccent(content) gin_trgm_ops`.
- **Shared:** `ErrorCodes.SEARCH_QUERY_INVALID`, `Limits.SEARCH_QUERY_MAX = 200`,
  `searchQuerySchema` (q lỏng ở zod — service quyết mã riêng), DTO `SearchResultItem/Page`.
- **API:** `GET /servers/:serverId/search` sau `@CheckAbility(['view','Server'])` —
  `SearchService` dựng `$queryRaw` tham số hóa: FTS `websearch_to_tsquery('simple', f_unaccent(q))`
  **OR** trigram `f_unaccent(content) ILIKE '%q%'`; filter `channelId`/`authorId`/`since` (ISO);
  cursor `before` theo id, mới nhất trước, limit ≤ 50 (mặc định 25); WHERE luôn ràng buộc
  `channel.serverId` + `deletedAt IS NULL`. IDOR thêm route (26).
- **Web:** `features/search/` (api + `useSearch` infinite query theo filter) + `SearchDialog`
  mở từ nút tìm trên header kênh: debounce 350 ms, lọc kênh/người gửi/thời gian (7/30 ngày —
  `since` tính trong event handler, render thuần), kết quả (kênh · tác giả · thời gian · đoạn
  trích), bấm → `/channels/:id?m=` nhảy tới tin + highlight (focusId sẵn có). i18n namespace
  `search` vi/en.

## Kiểm chứng

| Tiêu chí                                              | Cách thử                                                                                                                                                                                                                                                       | Kết quả      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Đúng kết quả, không lộ server khác, không trả tin xóa | API e2e `search.e2e-spec.ts` (mới): có dấu/không dấu (unaccent), con chuỗi TRONG từ (chỉ trigram thấy), filter channel/author/since, cursor before (4 id phân biệt, mới nhất trước), tin xóa mềm biến mất, server B có cùng từ khóa không lọt, outsider 403    | **5/5 pass** |
| q rỗng/quá dài/thiếu → 400 `SEARCH_QUERY_INVALID`     | API e2e test 5                                                                                                                                                                                                                                                 | pass         |
| IDOR (route 26 + bảng tấn công)                       | `idor.e2e-spec.ts` + route-coverage                                                                                                                                                                                                                            | pass (5/5)   |
| Quy ước API (cursor, không offset)                    | `api-conventions.e2e-spec.ts`                                                                                                                                                                                                                                  | pass         |
| UI: tìm, lọc kênh, nhảy tới tin có highlight          | web e2e `search.spec.ts` (mới): tìm không dấu ra kênh khác, lọc kênh thu hẹp/đúng, bấm kết quả → URL `?m=`, tin hiện trong kênh đích                                                                                                                           | pass         |
| **p95 trên seed lớn**                                 | `pnpm --filter api exec tsx test/search/measure.ts`: seed 20.000 tin tiếng Việt (2 kênh, trải 90 ngày, server riêng + dọn sau), 200 lần/truy vấn ở lớp SQL (đúng câu lệnh service dựng; HTTP/guard không thuộc "p95 truy vấn" — đúng tính đúng đắn do e2e giữ) | xem bảng số  |

Số đo p95 (máy dev, Postgres trong Docker, seed 20.000):

| Truy vấn                              | Kết quả   | p50     | p95         | p99     |
| ------------------------------------- | --------- | ------- | ----------- | ------- |
| FTS+unaccent, từ phổ biến ("báo cáo") | 26 (trần) | 46,6 ms | **51,3 ms** | 55,2 ms |
| FTS cụm 2 từ ("họp nhóm")             | 26        | 7,4 ms  | **8,5 ms**  | 10,6 ms |
| Trigram con chuỗi trong từ ("áo c")   | 26        | 17,0 ms | **19,9 ms** | 22,9 ms |
| Không khớp                            | 0         | 1,1 ms  | **1,4 ms**  | 1,6 ms  |

Ghi chú: từ đơn rất phổ biến (2.000/20.000 tin chứa) chạm trần 26 kết quả → tăng chi phí duyệt
candidate; chưa có ngưỡng p95 bắt buộc cho search trong plan — số local ghi làm baseline, đo
lại trên staging ở T6.1. Boot app trong script đo vướng DI module AI khi import động — đo
chuyển sang lớp SQL (câu lệnh giống hệt).

| Bộ                                      | Kết quả                               |
| --------------------------------------- | ------------------------------------- |
| API e2e                                 | **188/188 pass** (183 + 5 search)     |
| Web unit                                | 149 pass                              |
| Web e2e                                 | **31 pass, 1 skip** (30 + search mới) |
| Lint/typecheck/format/build/bundle/docs | pass — bundle 244,0 KB (≤ 450)        |

Chạy lại: Docker đang chạy; `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts
test/search.e2e-spec.ts`; đo: `pnpm --filter api exec tsx test/search/measure.ts`.

## Phát hiện khi làm

- `unaccent()` chỉ STABLE → wrapper IMMUTABLE; chữ ký hai tham số phải
  `public.unaccent('public.unaccent'::regdictionary, …)` — không schema-qualify thì inlining
  lúc ADD COLUMN/CREATE INDEX không tìm thấy dictionary.
- FTS `simple` tách NGUYÊN token: truy vấn "thu vien" không khớp token "thuvien" (hai từ khác
  nhau) — đường trigram ILIKE bù cho con chuỗi; test e2e thiết kế lại theo nhận thức này
  (probe trigram = "ilie" giữa từ "tailieu").
- Lint React Compiler: `Date.now()` trong render bị cấm (`react-hooks/purity`) — chuyển tính
  `since` vào event handler; `autoFocus` bị cấm (ADR-0029) — dùng `focus()` trong effect.

## Giới hạn và tiếp theo

- Hybrid vector (RRF với Qdrant) là T5.5; tìm kiếm semantic chưa có.
- Không xếp hạng theo relevance (mới nhất trước) — trade-off ghi trong ADR.
- p95 đo local; từ đơn phổ biến ~51 ms — nếu staging chậm, cân nhắc GIN fastupdate/`LIMIT` sớm
  hoặc rank giới hạn candidate.
- T4.7 (seed demo tiếng Việt ≥ 20.000 tin làm fixture) — script measure đã chứng minh mẫu
  seeding hàng loạt tái sử dụng được.

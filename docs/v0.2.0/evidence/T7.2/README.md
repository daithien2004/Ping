# Evidence T7.2 — Chín case study (6 đầy đủ, 3 ngắn)

- Ngày/múi giờ: 2026-11-01 (Asia/Saigon).
- Người thực hiện/review: agent thi công; OWNER duyệt phạm vi lô gộp 3. **Chưa có người thứ hai đọc lại.**
- Task, nhánh: T7.2, `feat/batch3-tf13-tf15-t7`, PR nháp local; base `3ed2ff4`.
- Môi trường: Windows 11, Node 24.18.0, pnpm 10.26.0; chỉ đọc file + `pnpm docs:check`, không chạy lại e2e.
- Phụ thuộc/thiết kế: [ADR-0038](../../../adr/0038-release-scope-v0.2.0.md) quy định case 1, 2, 4, 5, 6, 8 đầy
  đủ và case 3, 7, 9 ngắn khoảng nửa trang; [mẫu](../../case-studies/template.md) quy định các mục.

## Thay đổi

| Case              | Trước                                                                 | Sau                                                                                            | Số từ |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| 1 presence        | có nội dung, tiêu đề lệch chủ đề                                      | đổi tiêu đề "Bão presence: gộp theo cửa sổ thay vì phát ngay", thêm trạng thái                 | 1.226 |
| 2 outbox          | thiếu nhãn trạng thái đầy đủ                                          | ghi rõ phần chưa đo (p95 theo độ dài khoảng trống, thuộc T6.1)                                 | 780   |
| 3 unread          | dài, gắn nhãn ngắn                                                    | viết lại ~nửa trang, giữ nguồn + giới hạn                                                      | 537   |
| 4 search ACL      | đã đúng số                                                            | không sửa                                                                                      | 1.294 |
| 5 LLM             | thiếu nhãn trạng thái                                                 | thêm "hoàn thiện tại T7.2"                                                                     | 794   |
| 6 vận hành        | gắn nhãn ngắn nhưng ADR-0038 xếp đầy đủ                               | tách "Phương án đã cân nhắc" (3 phương án, 2 bị loại) và bảng bằng chứng 7 dòng                | 850   |
| 7 quy trình       | số cũ: 5 check CI, 67 ADR, 66 dòng done                               | 6 check CI, **68 file ADR (67 accepted, 1 proposed — ADR-0067)**, "hơn 65 dòng done"           | 532   |
| 8 frontend        | nói "chưa có INP", "visual chưa có baseline" (đã sai sau TF.13/TF.15) | thay bằng số TF.13/TF.14/TF.15: 36 baseline/12-12, audit token, LCP/CLS/INP, gói ảnh trước/sau | 1.112 |
| 9 tệp/Markdown/DM | dài, gắn nhãn ngắn                                                    | viết lại ~nửa trang, giữ 9/9 tệp độc hại bị chặn, 16/16 XSS, 13/13 DM                          | 559   |

Mục lục [case-studies/README.md](../../case-studies/README.md) thay câu "chưa có case study hoàn chỉnh" bằng bảng 9
case kèm mức đầy đủ/ngắn và ghi chú rằng hoàn thiện hồ sơ **không** phải nghiệm thu sản phẩm.

## Kiểm chứng

| Tiêu chí đạt                      | Lệnh/cách thử                                                             | Kết quả | Ghi chú                                                     |
| --------------------------------- | ------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| Đủ 9 case, đúng mức ADR-0038      | `ls docs/v0.2.0/case-studies/cs-*.md` + đọc dòng "Mức độ"                 | pass    | 6 đầy đủ (1,2,4,5,6,8), 3 ngắn (3,7,9)                      |
| Case ngắn giữ đúng cỡ nửa trang   | `wc -w`                                                                   | pass    | 532–559 từ; case đầy đủ 780–1.294 từ                        |
| Số ADR trong cs-07                | `ls docs/adr/*.md \| wc -l`, `grep -l 'Status: proposed'`                 | pass    | 68 file, 67 accepted, 1 proposed                            |
| Check CI bắt buộc                 | `grep` tên job trong `.github/workflows/ci.yml`                           | pass    | verify, api-e2e, web-e2e-gate, visual, migrations, security |
| Link nội bộ sống                  | `pnpm docs:check`                                                         | pass    | "không có liên kết tương đối nào hỏng"                      |
| Định dạng                         | `pnpm exec prettier --check docs/v0.2.0/case-studies/*.md`                | pass    | đã `--write` trước khi check                                |
| Số trong case 6 khớp script drill | đọc `redis-outage.drill.ts`, `postgres-outage.drill.ts`, `prod-stack.mjs` | pass    | **sửa 2 chỗ sai** (xem dưới)                                |

Lỗi tài liệu bắt được khi đối chiếu code:

- Case 6 viết "`/ready` degraded/**503** khi Redis chết" — sai: drill Redis khẳng định `/ready` = `degraded`
  nhưng **HTTP 200**; 503 là của drill Postgres. Đã sửa và tách hai dòng.
- Case 6 gán `/health` 200 cho kịch bản Redis — sai: đó là assert của Postgres. Đã chuyển.
- Case 6 mô tả docker smoke chung chung — đã ghi đúng các assert trong `prod-stack.mjs` (redirect 308, CSP,
  `requestId` xuyên proxy, socket qua TLS, SIGTERM exit 0).
- README gốc (sửa ở T7.3) vẫn ghi web dùng shadcn/ui.

## Giới hạn

- **Chưa có người thứ hai đọc.** Case study phục vụ phỏng vấn nên giọng văn và mức chi tiết chưa được kiểm bởi
  người khác; OWNER nên đọc lại 3 case ngắn.
- Số trong case 1–5 lấy từ evidence cũ (T4.x, T5.x, T4.6); **không chạy lại** trong lô này. Nếu code đổi sau
  thời điểm đó thì số có thể lệch — case ghi commit/ngày để đối chiếu.
- Case 6 không thể có RPO/RTO/chi phí thật: T2.x/T6.x chưa làm (ADR-0059).
- Không đưa case nào vào PDF/slide; chỉ markdown trong repo.

## Cách chạy lại

```bash
pnpm docs:check
pnpm exec prettier --check docs/v0.2.0/case-studies/*.md
for f in docs/v0.2.0/case-studies/cs-*.md; do wc -w "$f"; done
```

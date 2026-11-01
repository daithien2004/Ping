# Evidence T7.3 — Viết lại README gốc

- Ngày/múi giờ: 2026-11-01 (Asia/Saigon).
- Người thực hiện/review: agent thi công; OWNER duyệt phạm vi lô gộp 3. **Chưa có người thứ hai đọc.**
- Task, nhánh: T7.3, `feat/batch3-tf13-tf15-t7`, PR nháp local; base `3ed2ff4`.
- Môi trường: Windows 11, Node 24.18.0, pnpm 10.26.0; chỉ đọc file, dựng ảnh từ baseline đã có, không chạy app.
- Phụ thuộc/thiết kế: [ADR-0038](../../../adr/0038-release-scope-v0.2.0.md) (phạm vi), ADR-0050/0051 (UI),
  ADR-0059 (hoãn hạ tầng trả phí → không có link staging).

## Đã giao

- Cấu trúc mới: tóm tắt 60 giây (sản phẩm là gì, ba chỗ khó, kiểm bằng gì, chi phí, **cái gì chưa có**) → 4 ảnh
  chụp → sơ đồ kiến trúc (thêm worker và thành phần AI tuỳ chọn) → bảng công nghệ **kèm lý do chọn** → tính năng
  v0.2.0 và phần ngoài phạm vi → chạy local → lỗi thường gặp → lệnh → cấu trúc thư mục → tài liệu → triển khai và
  giới hạn công khai → phiên bản công cụ.
- Ảnh demo: `docs/screens/` gồm 4 ảnh chép từ baseline visual của TF.13 (chat sáng, chat tối, tìm kiếm 375 px,
  cài đặt server theme tối), tổng 279 KB, dữ liệu seed.
- Ghi rõ hai chỗ trước đây không có: (1) `pnpm dev` **không** chạy worker nên tệp đính kèm sẽ kẹt chờ xử lý —
  thêm lệnh chạy worker và một dòng trong bảng lỗi; (2) AI/mail là tuỳ chọn và hành vi khi thiếu key.
- Nêu thẳng **chưa có bản chạy công khai** và v0.1.0 là nghiệm thu local-only, thay vì để người đọc tự suy từ mục
  triển khai.

## Kiểm chứng

| Tiêu chí đạt                                  | Lệnh/cách thử                                                                                                                          | Kết quả | Ghi chú                                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mọi phiên bản công nghệ trong bảng là số thật | đọc `apps/*/package.json`                                                                                                              | pass    | NestJS 12.1.3, Prisma 7.10.1, Next 16.4.2, React 19.3.0, antd 6.6.7, TanStack Query 5.104.4, Zustand 5.0.8, use-intl 4.14.9, zod 4.6.7, Playwright 1.63.0, Socket.IO 4.8.4 |
| Số đếm                                        | `ls docs/adr/*.md`, `grep -l 'Status: proposed'`, `ls apps/web/src/components/ui \| grep -c '^ping-'`, đếm key `messages/{vi,en}.json` | pass    | 68 ADR (67 accepted, 1 proposed), 33 wrapper `Ping*`, 668 khoá mỗi ngôn ngữ                                                                                                |
| Số IDOR và visual                             | [status](../../status.md), [TF.13](../TF.13/README.md)                                                                                 | pass    | 61 endpoint IDOR; 36 baseline = 6 màn × 2 theme × 3 viewport                                                                                                               |
| Tuyên bố về AI/mail tuỳ chọn khớp code        | `apps/api/src/config/env.schema.ts`, `modules/ai/ai.module.ts`, `ai/groq-llm.client.ts`                                                | pass    | `GROQ_API_KEY`/`QDRANT_URL`/`SMTP_URL` đều optional; thiếu key → `AI_UNAVAILABLE`, thiếu SMTP → `ConsoleMailer`                                                            |
| Worker thật là tiến trình riêng               | `apps/api/package.json` (`dev`, `dev:worker`) và `turbo run dev`                                                                       | pass    | `pnpm dev` chỉ bật web + api; worker là `pnpm --filter api dev:worker`                                                                                                     |
| Số seed:demo                                  | `apps/api/prisma/seed-demo.ts`                                                                                                         | pass    | 3 server, 9 kênh × 2.400 tin = 21.600 tin; mention mỗi 60 tin → 360                                                                                                        |
| Ảnh tham chiếu tồn tại                        | script kiểm `![](...)` trong README                                                                                                    | pass    | 4/4 ảnh cục bộ tồn tại (chỉ badge CI là URL ngoài)                                                                                                                         |
| Link và định dạng                             | `pnpm docs:check`, `pnpm exec prettier --check README.md`                                                                              | pass    | 0 link hỏng; prettier sạch sau `--write`                                                                                                                                   |
| Lệnh trong bảng tồn tại                       | đọc `apps/web/package.json`, `apps/api/package.json`                                                                                   | pass    | `test:visual`, `test:visual:update`, `check:bundle`, `audit:design`, `ai:backfill` đều có                                                                                  |

Lỗi tài liệu bắt được khi rà:

- README cũ ghi web dùng **shadcn/ui**; từ v0.2.0 web dùng antd 6.6 sau 33 wrapper `Ping*`
  (ADR-0023 giữ phần token, ADR-0050/0051 thay phần UI kit). Đã sửa và ghi lý do đổi.
- README cũ nói "gap recovery" không rõ cơ chế; bản mới nói đúng con trỏ `after=<messageId>`
  ([ADR-0044](../../../adr/0044-gap-recovery.md)) — schema **không có** cột `seq`.
- README cũ ghi `docs/adr/ (33+ quyết định)`; thực tế 68.

## Giới hạn

- **Chưa xem render trên GitHub.** Đã kiểm link, ảnh, prettier; chưa kiểm hình mermaid và bảng ảnh hiển thị ra sao
  trên giao diện GitHub thật (cần push mới xem được). Nếu lệch, sửa sau khi CI chạy trên `main`.
- Ảnh là baseline visual trên Windows 1280×800 / 375×812; chữ trong ảnh là tiếng Việt theo seed, không có dữ liệu
  người dùng thật.
- "Chạy local trong ~15 phút" là con số cũ của README v0.1.0, **chưa bấm giờ lại** trong lô này; bước bootstrap
  không đổi.
- README chỉ nói sản phẩm làm được gì; không thay [plan](../../plan.md) hay [nghiệm thu](../../acceptance/v0.2.0.md) —
  nơi giữ danh sách việc và ô "chưa đo".

## Cách chạy lại

```bash
pnpm docs:check
pnpm exec prettier --check README.md
node -e "const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);console.log(f(require('./apps/web/messages/vi.json')).length)"
```

Mở `README.md` ở chế độ xem trước markdown để kiểm mermaid và bảng ảnh.

# Evidence `T4.7` — `Seed demo tiếng Việt: ≥ 3 server, ≥ 20.000 tin, lặp lại như nhau`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode).
- Task, nhánh: T4.7 — `feat/t4.7-seed-demo` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base = main sau T4.6.
- Môi trường: Windows, Docker Desktop 28.5.1, Postgres trong compose.

## Thay đổi

- **`apps/api/prisma/seed-demo.ts`** (mới): seed demo tiếng Việt — 3 server theo chủ đề
  (Ping Coffee / Ping Dev Team / Ping Hobby), mỗi server 3 kênh có chủ đề riêng, 4 người dùng
  (tái dùng alice/bob/carol của seed dev qua upsert email + thêm `david@ping.dev`), role
  `@everyone`, **21.600 tin** (2.400/kênh), 360 mention cho alice (mỗi 60 tin một tin nhắc —
  đủ dữ liệu demo badge unread/mention).
- **Determinism:** id cố định (dải `019b0000-…`, 12 hex cuối do `demoId` dựng — tách khỏi dải
  seed dev `0199…`), PRNG mulberry32 seed 42, thời điểm tin tăng đều từ mốc cố định
  2026-09-01T00:00:00Z (không `Date.now`). Upsert theo id → chạy lại cho cùng trạng thái.
- **`pnpm seed:demo`** (root) → `pnpm --filter api seed:demo` → `tsx prisma/seed-demo.ts`;
  script tự nạp `.env` gốc (không qua Prisma CLI).
- **README:** đoạn giới thiệu `pnpm seed:demo`.

## Kiểm chứng

| Tiêu chí đạt                            | Cách thử                                                                                                                                        | Kết quả                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ≥ 3 server, ≥ 20.000 tin có chủ đề      | chạy `pnpm seed:demo`: `servers=3 channels=9 messages=21600 mentions=360`; mỗi kênh một chủ đề (corpus tiếng Việt cố định)                      | pass                                                                                     |
| **Chạy lặp lại cho kết quả như nhau**   | fingerprint SQL (count + sum(hashtext(content)) + min/max createdAt) trước và sau lần chạy thứ hai                                              | `21600\|2255050328534\|2026-09-01 00:00:00\|2026-09-04 21:59:13` — **giống hệt hai lần** |
| Dữ liệu dùng được với tính năng vừa làm | FTS trên demo: "hop tuan" (không dấu) khớp 412 tin ở Ping Dev Team; trigram đúng phạm vi; 360 mention cho alice (badge + GET unread có dữ liệu) | pass                                                                                     |
| Không dữ liệu thật                      | toàn bộ nội dung là câu viết tay theo chủ đề; người dùng chỉ là tài khoản seed                                                                  | pass                                                                                     |
| Không phá dữ liệu dev/CI                | id demo trong dải riêng; seed dev không đụng dải `019b…`; `prisma db seed` CI không thay đổi                                                    | pass                                                                                     |
| Bộ chuẩn                                | lint / typecheck / api unit 140 / format / docs:check                                                                                           | pass                                                                                     |

Chạy lại: `pnpm seed:demo` (yêu cầu Docker đang chạy, đã migrate); fingerprint bằng lệnh
`psql` trong evidence này.

## Phát hiện khi làm

- alice/bob/carol đã tồn tại từ seed dev với id `0199…` — upsert theo email không đổi id;
  mọi khóa ngoại (server.ownerId, member.userId, message.authorId) phải tra lại **id thật**
  sau upsert, nếu không văng FK violation.
- UUID không hỗ trợ `startsWith` trong filter Prisma — thống kê đếm theo khoảng
  `gte/lte` trên dải demo (như hành vi cursor).
- Compound unique chứa cột NULL (MessageMention) không upsert theo khóa đó được — mention
  dùng id tường minh.
- Probe FTS phải dùng từ thật có trong corpus và đúng token (token "hop" ≠ từ "ho" khi gõ
  thiếu) — bài học: kiểm tra bằng token của chính cột `search`.

## Giới hạn và tiếp theo

- Chưa gắn reply/reaction (chưa có tính năng); mention chỉ về alice — đủ cho demo badge.
- Dải id demo cố định nghĩa là không nên chạy `seed:demo` trên DB production (script là dev
  tool, ghi chú trong README).
- Theo lịch 8 tuần: Pha 4 còn T4.6 ✓ / T4.7 ✓ — kế tiếp theo thứ tự ADR-0059 là Pha G
  (TG.0 kiểm kê + ADR-0056, rồi TG.4 markdown/emoji, TG.23 emoji picker).

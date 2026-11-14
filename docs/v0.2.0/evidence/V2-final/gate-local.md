# Gate local trên head `37a4a71` (2026-11-14)

Máy Windows, Docker (Postgres 17, Redis 7, Qdrant 1.12), nhánh `chore/ui-structure-and-skin-removal`.
Log đầy đủ nằm ở thư mục nháp của phiên (không commit); bảng dưới là số đọc được từ log.

| Bước      | Lệnh                             | Kết quả                                                                  |
| --------- | -------------------------------- | ------------------------------------------------------------------------ |
| Lint      | `pnpm lint`                      | 0 lỗi, 14 cảnh báo (toàn bộ `<img>` và `exhaustive-deps` đã có từ trước) |
| Typecheck | `pnpm typecheck`                 | xanh                                                                     |
| Unit      | `pnpm test`                      | shared 80/80, api 317/317 (43 file), web 550/550 (67 file)               |
| API e2e   | `pnpm --filter api test:e2e`     | **374/374** (45 file), gồm 2 test mới của outbox relay                   |
| Build     | `pnpm build`                     | xanh                                                                     |
| Bundle    | `pnpm --filter web check:bundle` | JS tải ban đầu **248,9 KB** gzip (ngân sách 450 KB; trước đó 248,2 KB)   |
| Tài liệu  | `pnpm docs:check`                | không liên kết hỏng                                                      |

## Chưa chạy ở local

`pnpm --filter web test:e2e` và `pnpm --filter web test:visual`: OWNER quyết định để CI chạy sau khi
push (ngày 2026-11-14) vì bộ này mất khoảng 25–35 phút ở máy local. CI có `web-e2e-gate` và `visual`
là check bắt buộc, và workflow **Publish and deploy** chỉ chạy khi CI xanh (`workflow_run` + `conclusion
== success`), nên bản lỗi không tự lên production. Kết quả thật của hai bước này được ghi ở
[deploy.md](deploy.md) sau khi CI chạy.

## Ghi chú

- Lần chạy đầu bị ngắt giữa `pnpm build` do máy khởi động lại qua đêm; bốn bước đầu giữ nguyên kết quả
  vì không có thay đổi nào trong repo sau đó, `build`/`bundle`/`docs` chạy lại sau khi bật lại Docker.
- Chạy nhiều spec API e2e liên tiếp có thể gặp `429` ở đăng ký (5/phút/IP, ADR-0080); chạy cả bộ thì ổn.

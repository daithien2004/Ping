# Migration

Quy tắc (CLAUDE.md, 7 và 13): thay đổi DB **chỉ** qua migration của Prisma; **không sửa** migration đã merge; theo
**expand/contract** để code của phiên bản liền trước vẫn chạy được với schema mới (rolling deploy và rollback).

> Đã chạy thật: `migrate deploy` trên DB trống (CI và `pnpm bootstrap`), `migrate diff --exit-code` và `migrate status`.
> Chưa chạy thử ở đây: `migrate resolve` (theo tài liệu Prisma) và `CREATE INDEX CONCURRENTLY`.

## Viết một migration

1. Sửa `apps/api/prisma/schema.prisma`.
2. Tạo migration (chỉ trên máy dev, cần Postgres đang chạy):

   ```bash
   pnpm --filter api exec prisma migrate dev --name <mo-ta-ngan>     # hoặc: pnpm db:migrate
   ```

3. **Đọc file SQL được sinh ra** trong `apps/api/prisma/migrations/<thời-gian>_<tên>/migration.sql` trước khi commit:
   Prisma có thể sinh `DROP` hoặc đổi kiểu cột mà bạn không định làm.
4. Commit schema và thư mục migration cùng nhau. CI job `migrations` chạy toàn bộ migration trên DB trống rồi
   `prisma migrate diff --exit-code`: nếu schema trong code không khớp với kết quả migration (quên tạo migration, hoặc
   sửa tay), job đỏ.

## Expand / contract: đổi tên hoặc xóa cột, không làm trong một lần deploy

Code cũ và code mới cùng chạy trong lúc deploy (và code cũ phải chạy lại được nếu rollback). Vì vậy chia nhỏ:

| Bước | Deploy | Việc                                                                                                     |
| ---- | ------ | -------------------------------------------------------------------------------------------------------- |
| 1    | A      | **Expand:** thêm cột/bảng mới (cho phép NULL hoặc có mặc định). Code vẫn chỉ dùng cái cũ.                |
| 2    | B      | Code ghi vào cả hai, đọc từ cái mới (có phương án dự phòng sang cái cũ). Chạy backfill dữ liệu cũ.       |
| 3    | C      | Code chỉ dùng cái mới. Cái cũ không còn ai đọc.                                                          |
| 4    | D      | **Contract:** xóa cột/bảng cũ. Chỉ làm khi chắc chắn không phiên bản nào còn dùng và không cần rollback. |

Ví dụ đổi tên `Message.content` thành `body`: A thêm `body`; B ghi cả hai và backfill; C đọc `body`; D xóa `content`.
Thêm cột bắt buộc: thêm với `DEFAULT` hoặc cho NULL ở bước A, ràng buộc `NOT NULL` ở bước sau khi dữ liệu đã đủ.

### Index trên bảng lớn

`CREATE INDEX` thường chặn ghi vào bảng trong lúc xây. Với bảng lớn dùng `CREATE INDEX CONCURRENTLY` trong một
migration riêng (Prisma không sinh được dạng này: viết tay SQL, và migration đó không được chứa lệnh nào khác vì
`CONCURRENTLY` không chạy trong transaction). Index `Member(serverId, id)` ở ADR-0028 dùng `CREATE INDEX` thường vì
bảng nhỏ.

## Áp migration khi triển khai

`prisma migrate deploy` chạy **một lần mỗi lần deploy, trước khi rollout API**; instance API **không** tự migrate
lúc khởi động (nếu nhiều instance cùng migrate sẽ đua nhau).

```bash
# stack docker compose (ví dụ project pingprod): service `migrate` chạy xong thành công thì api mới khởi động
docker compose -p pingprod -f docker-compose.prod.example.yml --env-file .env.prod up -d migrate

# hoặc chạy tay với DATABASE_URL trỏ vào DB cần migrate
DATABASE_URL=postgresql://... pnpm --filter api exec prisma migrate deploy
```

`migrate dev` **không bao giờ** chạy trên DB thật: nó có thể reset dữ liệu.

## Khi migration lỗi giữa chừng

- Postgres chạy migration trong transaction, nên migration SQL thuần thường **không để lại một nửa**: nó rollback và
  Prisma ghi trạng thái "failed" trong `_prisma_migrations`. Kiểm tra:

  ```bash
  pnpm --filter api exec prisma migrate status
  ```

- Sửa nguyên nhân (thường là dữ liệu hiện có vi phạm ràng buộc mới). **Đừng sửa file migration đã áp ở nơi khác**;
  nếu chưa từng áp ở đâu ngoài máy bạn thì có thể sửa. Sau khi DB đã sạch (migration không để lại thay đổi nào):

  ```bash
  pnpm --filter api exec prisma migrate resolve --rolled-back <tên_migration>
  pnpm --filter api exec prisma migrate deploy
  ```

- Nếu migration **đã áp một phần** (ví dụ lệnh không nằm trong transaction như `CONCURRENTLY`), kiểm tra DB bằng
  tay, đưa nó về trạng thái hoàn chỉnh, rồi đánh dấu đã áp: `prisma migrate resolve --applied <tên_migration>`.
- Luôn **sao lưu trước khi migrate trên dữ liệu thật** ([backup-restore.md](backup-restore.md)).

## Rollback

Prisma không có migration "down". Rollback là chạy lại **code của phiên bản trước** (schema mới vẫn tương thích với nó
nhờ expand/contract, xem [rollback.md](rollback.md)); đừng cố hoàn tác schema bằng tay trừ khi có sao lưu và đã thử
trên bản sao.

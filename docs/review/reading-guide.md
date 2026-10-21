# Hướng dẫn tự review bốn vùng nhạy cảm

Cổng nghiệm thu `v0.1.0` đòi chủ dự án **tự review và hiểu** bốn vùng: xác thực, phân quyền, migration, gateway realtime.
Mỗi mục dưới đây cho biết: đọc file nào, theo thứ tự nào, vùng này bảo vệ điều gì, và các câu hỏi nên tự trả lời được.
Câu nào không trả lời được thì đó là chỗ cần đọc lại (hoặc mở một issue), không phải chỗ để tin mù quáng.
Mỗi vùng mất khoảng 30–45 phút đọc. Khi xong, ghi ngày vào [docs/acceptance/v0.1.0.md](../acceptance/v0.1.0.md).

Cách đọc nhanh: đọc **test trước, code sau**. Tên test cho biết hệ thống hứa điều gì; code cho biết hứa bằng cách nào.

## 1. Xác thực (`apps/api/src/modules/auth`)

**Bảo vệ điều gì:** chỉ đúng chủ tài khoản vào được; token bị đánh cắp có tuổi thọ ngắn và bị phát hiện khi dùng lại.

Thứ tự đọc ([ADR-0007](../adr/0007-auth-token-model.md) trước):

1. `auth.constants.ts`: access token 15 phút, refresh token 30 ngày, cookie chỉ gửi tới `/api/v1/auth`, cửa sổ 10 giây
   (`REFRESH_REUSE_GRACE_MS`).
2. `auth.controller.ts`: ai có throttle (`register` 5/phút, `login` 10/phút), ai có `CsrfGuard` (`refresh`, `logout`),
   cookie đặt `httpOnly` + `sameSite: 'lax'` + `secure` ở production.
3. `auth.service.ts`, theo thứ tự `login` → `refresh` → `issueTokens`:
   - `login`: vì sao email không tồn tại vẫn chạy một lần `argon2.verify` (`burnVerify`)? Thông báo lỗi có phân biệt
     "sai mật khẩu" và "không có user" không?
   - `refresh`: ba nhánh của một session đã `revokedAt` (trong 10 giây thì 401, sau 10 giây thì **revoke mọi session**) và
     vì sao điều kiện `revokedAt: null` trong `updateMany` làm việc xoay vòng nguyên tử.
   - `issueTokens`: refresh token là 48 byte ngẫu nhiên, DB chỉ lưu SHA-256 của nó. Vì sao SHA-256 đủ mà mật khẩu
     lại cần argon2id?
4. `login-attempts.service.ts`: 5 lần sai từ một cặp (email, IP) hoặc 20 lần sai từ mọi IP cộng lại thì khóa tối đa
   15 phút; khóa theo hash nên Redis không chứa email thô. Redis chết thì đăng nhập **bị từ chối** (fail-closed,
   ADR-0026/0027), không mở cửa.
5. `jwt-auth.guard.ts` và `verifyAccessToken`: nơi duy nhất xác minh access token; gateway cũng dùng chung.

Test nên mở: `apps/api/test/auth.e2e-spec.ts`, `idor.e2e-spec.ts` (bảng tấn công), `abuse-limits.e2e-spec.ts` và
`redis-outage.e2e-spec.ts` cho đường lỗi hạ tầng.

Câu hỏi tự hỏi:

- Nếu kẻ trộm lấy được refresh token và dùng trước chủ thật, chuyện gì xảy ra ở lần dùng tiếp theo của chủ thật?
- Access token đã phát có thu hồi được trước 15 phút không? (Không: đó là đánh đổi của JWT không trạng thái; logout chỉ
  đóng refresh. Có chấp nhận được với mô hình đe dọa không?)
- `register` trả 409 "Email or username already taken": có lộ việc email đã tồn tại không, và throttle 5/phút có đủ làm
  chậm việc dò đó không?
- Kẻ xấu cố ý đoán sai 20 lần có khóa được tài khoản nạn nhân 15 phút không? (Có; đây là đánh đổi đã ghi ở đầu
  `login-attempts.service.ts`.)
- Có chỗ nào log hoặc trả về `passwordHash`, token hay cookie không? (Gợi ý: tìm `userPublicSelect` và `scrubEvent`.)

## 2. Phân quyền (`apps/api/src/modules/ability` và `packages/shared/src/ability.ts`)

**Bảo vệ điều gì:** người dùng chỉ làm được việc vai trò cho phép, và chỉ trong server của mình.

Thứ tự đọc ([ADR-0003](../adr/0003-shared-authorization.md), [ADR-0004](../adr/0004-role-permission-grants.md),
[ADR-0013](../adr/0013-authorization-runtime.md)):

1. `packages/shared/src/permissions.ts`: các bit quyền (`bigint`), `hasPermission`.
2. `packages/shared/src/ability.ts`: **đây là nơi duy nhất định nghĩa luật** (CLAUDE.md mục 9).
   - `defineAbilityFor`: owner hoặc `ADMINISTRATOR` được `manage all`; người khác nhận từng quyền theo bit.
   - Dòng `can(['update','delete'], 'Message', { authorId })`: sửa/xóa tin của chính mình không cần bit nào.
   - `canManagePermissions`, `canKickMember`, `canManageMember`: luật "không trao được thứ mình không có"
     (`permissions & ~ctx.permissions`) và "không ai kick được owner hay chính mình".
3. `ability.factory.ts`: quyền hiệu lực = OR mọi role của member + `@everyone`; cache Redis 30 giây; không phải member
   thì ném 403. Cache chết = tính lại từ Postgres (`failOpen`).
4. `ability.guard.ts`: dò `serverId` từ `serverId`/`channelId`/`messageId`/`roleId` trên route; **route đòi quyền mà không
   dò ra server thì từ chối** (fail closed).
5. Nhìn một controller thật (vd. `modules/messages/messages.controller.ts`): `@UseGuards(JwtAuthGuard, AbilityGuard)` và
   `@CheckAbility`, rồi service ràng `channelId` trong `where`.

Test nên mở: `packages/shared/src/ability.spec.ts` (bảng quyền), `apps/api/test/roles-authz.e2e-spec.ts`, `kick.e2e-spec.ts`,
`idor.e2e-spec.ts` (người ngoài và moderator server khác bị chặn ở từng route có ID; test tự quét controller và đỏ
nếu có route mới thiếu).

Câu hỏi tự hỏi:

- Thêm một endpoint `GET /servers/:serverId/xyz` mà quên `@CheckAbility`: guard cho qua hay chặn? Test nào đỏ?
- Quyền vừa bị gỡ, user vẫn làm được tối đa bao lâu? (30 giây cache nếu Redis không dọn được; bình thường
  `invalidateServer` xóa ngay.) Socket đang nối thì sao? (Phần 4.)
- Vì sao kiểm tra "tập bit nằm trong quyền của mình" nằm ngoài CASL?
- `AbilityGuard` tra `channelId`/`messageId` bằng `findUnique` rồi lấy `serverId`: nếu id không tồn tại thì trả 404; có
  lộ việc id đó tồn tại ở server khác không? (Id không tồn tại và id ở server khác cho phản hồi khác nhau: 404 và 403.)

## 3. Migration (`apps/api/prisma/migrations`)

**Bảo vệ điều gì:** dữ liệu thật không mất khi nâng cấp; bản code liền trước vẫn chạy được với schema mới
(rolling deploy, CLAUDE.md mục 13).

Thứ tự đọc ([runbook migrations](../runbook/migrations.md), [ADR-0005](../adr/0005-uuid-column-type.md),
[ADR-0032](../adr/0032-ci-and-containers.md)):

1. `20261018071325_init`: toàn bộ schema ban đầu. Đọc qua để biết bảng nào có quan hệ nào và `onDelete` gì
   (`Message.authorId` là `RESTRICT`, các bảng con của server là `CASCADE`).
2. `20261018074500_session-refresh-token-unique` và `20261018081500_server-invite-code`: migration nhỏ, thêm unique.
3. `20261019070000_id-text-to-uuid`: **migration rủi ro nhất**. Đổi mọi id từ `TEXT` sang `UUID` bằng
   `ALTER ... TYPE ... USING "id"::uuid`: gỡ FK → đổi kiểu → gắn lại FK giữ nguyên `onDelete`. Viết tay vì
   `migrate diff` sinh `DROP COLUMN` + `ADD COLUMN` sẽ mất dữ liệu. Đây cũng là ví dụ cho thấy migration kiểu này
   **không** theo expand/contract; nó chỉ chấp nhận được vì xảy ra trước khi có dữ liệu thật.
4. `audit-log`, `audit-member-kick` (thêm giá trị enum), `member-server-id-index`: chỉ thêm, không phá cái cũ.
5. `scripts/check-migration-upgrade.sh` và job `migrations` trong `.github/workflows/ci.yml`: CI dựng schema của bản
   trước, nạp dữ liệu, áp migration mới, chạy lại test; và bắt lệch giữa `schema.prisma` và thư mục migrations.

Câu hỏi tự hỏi:

- Muốn đổi tên một cột: các bước expand/contract là gì và qua mấy lần deploy?
- Muốn thêm cột `NOT NULL` vào bảng đang có dữ liệu: vì sao cần giá trị mặc định hoặc điền dữ liệu trước?
- `CREATE INDEX` thường khóa ghi bảng; trên bảng 3 triệu tin nhắn nên dùng `CONCURRENTLY` thế nào, và vì sao Prisma
  cần migration riêng cho nó? (Xem `member-server-id-index` và runbook.)
- Migration chạy lúc nào trong deploy? (Bằng target `migrate`, **trước** khi khởi động API mới; API không tự migrate.)
- Hoàn tác một migration đã áp: có làm được không, hay chỉ có "tiến lên"? ([rollback](../runbook/rollback.md))

## 4. Gateway realtime (`apps/api/src/modules/realtime`)

**Bảo vệ điều gì:** chỉ người có quyền xem kênh mới nhận tin của kênh; quyền đổi thì socket đang nối cũng đổi theo.

Thứ tự đọc ([ADR-0006](../adr/0006-realtime-authorization-and-presence.md),
[ADR-0016](../adr/0016-personal-membership-events.md), [ADR-0024](../adr/0024-web-realtime.md)):

1. `realtime.gateway.ts`, hàm `afterInit`: middleware xác thực chạy **trước** khi socket được coi là đã kết nối; không
   có token hợp lệ thì không vào được (`UNAUTHORIZED`).
2. `handleConnection`: vào room `user:<id>`; hẹn giờ ngắt socket đúng lúc JWT hết hạn (client phải refresh rồi nối
   lại); giới hạn 10 socket/user; phát presence (lỗi presence **không** được ngắt người dùng đã xác thực).
3. `joinChannel`: kênh không tồn tại và không có quyền trả **cùng một** `FORBIDDEN` (không lộ sự tồn tại); phải là
   member và có `view Message` mới được `socket.join`. Lệnh join/leave của một socket xếp hàng (`enqueueRoomCommand`)
   để không đua nhau.
4. `handleTyping`: chỉ người **đã ở trong room** mới phát được "đang gõ"; giãn 1 giây.
5. `overBudget`: 20 event/giây thì bỏ qua, 60 event/giây thì ngắt socket (chống flood).
6. `realtime.service.ts`: `refreshAccess` là phần quan trọng nhất. Quyền chỉ kiểm lúc `channel.join`, nên khi đổi role,
   kick, rời server thì phải chủ động `socketsLeave` khỏi room, và báo `MemberRemoved`/`PermissionsChanged` cho user.
   Ghi chú `ponytail:` nói rõ giới hạn: duyệt mọi member của server (ở [tech-debt](../tech-debt.md), P2).
7. Điểm phát tin: tin nhắn đi theo **REST rồi mới phát** (CLAUDE.md mục 3): tìm `emitToChannel` trong
   `modules/messages` và kiểm tra nó chỉ được gọi sau khi lưu thành công.

Test nên mở: `apps/api/test/realtime.e2e-spec.ts`, `members-presence.e2e-spec.ts`, `presence-resilience.e2e-spec.ts`,
`redis-outage.e2e-spec.ts`, `shutdown-order.e2e-spec.ts`.

Câu hỏi tự hỏi:

- Một user bị kick đang mở socket: tới lúc nào thì hết nhận được tin của kênh? (Ngay khi `refreshAccess` chạy, vì
  `socketsLeave`; nếu bước này lỗi thì tới khi socket nối lại.) Có test chứng minh không?
- Hai instance API: một `channel.join` ở instance A có làm tin phát từ instance B tới được client không? (Redis
  adapter: có.) Chuyện gì xảy ra khi Redis chết? ([ADR-0026](../adr/0026-failure-modes-and-graceful-shutdown.md))
- Client có thể tự `socket.join` một room bất kỳ không? (Không: join chỉ thực hiện phía server sau khi kiểm quyền.)
- Presence phát cho cả server mỗi lần nối/ngắt: vì sao đây là nợ P1 ở quy mô lớn? ([perf](../perf/README.md))

## Khi review xong

- Việc nào còn nghi ngờ: ghi vào [tech-debt](../tech-debt.md) kèm bằng chứng và mức ưu tiên.
- Có thể chạy `/review` (lệnh của dự án, xem `.claude/commands/review.md`) trên từng vùng để có một góc nhìn thứ hai.
- Đừng sửa code trong lúc review trừ khi tìm ra lỗi thật; lỗi thật thì làm theo quy trình bình thường: test đỏ trước.

# Evidence TG.11 — Ban/unban server

- Ngày: 2026-10-30 (Asia/Saigon); nhánh `feat/tg11-bans`; base `2662d94` (main sau TG.8).
- Không cần ADR theo kế hoạch (cột "PR + test").

## Đã giao

**Shared**: mã lỗi `BANNED` (join bị chặn — danh mục cũ không diễn đạt "bị cấm"); event
`member.banned {serverId, userId}` tới room server + cờ optional `banned: true` trong
`MemberRemovedPayload`; subject `ServerBan` (rule trong khối KICK_MEMBERS); 2 AuditAction
`SERVER_BAN`/`SERVER_UNBAN`; `schemas/ban.ts` (create/list DTO).

**API**:

- Migration expand `20261029120000_tg11_server_bans`: `ServerBan {serverId, userId, reason?,
bannedById, createdAt}` — unique (serverId, userId), index (serverId, id desc) cho list,
  index userId (tra khi join); KHÔNG FK tới Member (ban tồn tại SAU khi membership đã xóa).
- `POST /servers/:id/bans` {userId, reason?, deleteMessages24h?}: **KICK_MEMBERS tái dùng**
  (ban = kick nặng hơn, cùng nhóm công việc — không thêm bit); thứ bậc tái dùng
  `canKickMember` (so tập quyền, không phải Role.position); không ban chính mình; target phải
  là member. Một transaction: kick (xóa Member) + tạo ServerBan + audit `SERVER_BAN`;
  `deleteMessages24h` = soft-delete tin của nạn nhân trong 24 giờ trên các channel của server
  - outbox `message.deleted` per-message (indexer gọn chỉ mục, đúng pattern
    `MessagesService.remove`), số đếm vào audit `metadata.deletedMessages`; IdempotencyInterceptor
    (quy tắc 12), 201 + DTO.
- `DELETE /servers/:id/bans/:userId` — unban; không có ban → 404 (nhất quán repo: kick member
  lạ 404). `GET /servers/:id/bans` — chỉ KICK_MEMBERS; người có VIEW_AUDIT_LOG xem lịch sử
  qua `/audit-log` (đã đủ).
- **Join kiểm ServerBan trước mọi nhánh** → 403 `BANNED` — người bị ban không vào lại được
  bằng mã mời.
- Realtime: tái dùng nguyên pipeline kick cho nạn nhân (`refreshAccess` + `member.removed`
  riêng, cờ optional `banned: true`) + **event mới `member.banned`** tới room server — KHÔNG
  tái dùng `member.removed` cho room server vì web hiểu event đó là "chính mình mất server"
  và xóa UI; tên event mới để client cũ bỏ qua an toàn. Reason KHÔNG phát realtime (xem qua
  danh sách ban/audit).

## Kiểm chứng

| Hạng mục              | Kết quả                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API unit              | **278/278** (36 file; +13 bans.service: thứ bậc từng nhánh, transaction ban+kick, đếm deleteMessages24h + outbox, unban 404, join blocked)                                                                                                                                                              |
| API e2e `bans`        | **8/8**: ban → mất khỏi member list + realtime `member.removed{banned:true}` + `member.banned`; join lại 403 `BANNED`; unban → join OK; thứ bậc 4 nhánh (member→owner 403, thấp→cao 403…); deleteMessages24h giữ tin cũ/xóa tin mới; danh sách ban đủ shape (reason, bannedBy); IDOR; audit cả 2 action |
| IDOR                  | 55 route (+3 bans), pass                                                                                                                                                                                                                                                                                |
| Hồi quy               | idor 5/5, kick 4/4, servers 13/13, audit-log 3/3, realtime 17/17, api-conventions 36/36, members-presence 2/2, my-permissions 3/3                                                                                                                                                                       |
| Lint/format/typecheck | sạch (kèm vá typecheck web: audit-log-table thiếu nhãn 2 action mới)                                                                                                                                                                                                                                    |
| Migration             | `20261029100000`… apply, in sync; `migrate diff --exit-code` no difference                                                                                                                                                                                                                              |

## Lưu ý

- Web UI (danh sách ban + nút ban trong member list) — phần web của TG.11 kế hoạch gộp vào
  đợt web kế (TG.10 web đang song song; audit-log-table đã có nhãn 2 action mới sẵn).
- Rate limit `/auth/register` 5/phút/IP: bans e2e đăng ký 5 user tuần tự + flushdb trước user
  thứ 6 (comment trong spec).
- Merge `--no-ff` `55b6bbc` vào `main`, đã push (theo ủy quyền); CI `main` phán quyết sau
  push (kèm vá hồi quy CI của TG.8: mailpit services + chính sách xác minh chỉ bật khi có
  `SMTP_URL`).

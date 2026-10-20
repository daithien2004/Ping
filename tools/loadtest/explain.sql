-- EXPLAIN ANALYZE các query nóng trên dữ liệu load test (hướng dẫn 16.3, ADR-0033). Chạy:
--   COLD=$(node -p "require('./tools/loadtest/data/meta.json').channels.at(-1).id")
--   HOT=$(node -p "require('./tools/loadtest/data/meta.json').hotChannelId")
--   SERVER=$(node -p "require('./tools/loadtest/data/meta.json').serverId")
--   docker exec -i ping-postgres-1 psql -U ping -d ping_load -v hot=$HOT -v cold=$COLD -v server=$SERVER < tools/loadtest/explain.sql
-- Câu lệnh dưới đây là bản SQL của các lời gọi Prisma trong messages.service.list và servers.members.

\echo '== Số hàng của channel nóng và tổng số tin'
SELECT count(*) FILTER (WHERE "channelId" = :'hot') AS hot_channel, count(*) AS total FROM "Message";

\echo '== 1. Trang đầu lịch sử (ORDER BY id DESC LIMIT 51), channel nóng'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, content, "createdAt" FROM "Message"
WHERE "channelId" = :'hot' AND "deletedAt" IS NULL
ORDER BY id DESC LIMIT 51;

\echo '== 1b. Trang đầu, channel ÍT tin (lịch sử thật của đa số channel): phải dùng Message(channelId, id DESC)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, content, "createdAt" FROM "Message"
WHERE "channelId" = :'cold' AND "deletedAt" IS NULL
ORDER BY id DESC LIMIT 51;

\echo '== 2. Trang sâu (cursor before = id ở giữa lịch sử của channel nóng)'
SELECT id AS cursor FROM "Message" WHERE "channelId" = :'hot'
ORDER BY id DESC OFFSET 400000 LIMIT 1 \gset
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, content, "createdAt" FROM "Message"
WHERE "channelId" = :'hot' AND "deletedAt" IS NULL AND id < :'cursor'
ORDER BY id DESC LIMIT 51;

\echo '== 3. Danh sách thành viên theo cursor (Member(serverId, id))'
SELECT id AS member_cursor FROM "Member" WHERE "serverId" = :'server'
ORDER BY id ASC OFFSET 2500 LIMIT 1 \gset
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "Member"
WHERE "serverId" = :'server' AND id > :'member_cursor'
ORDER BY id ASC LIMIT 51;

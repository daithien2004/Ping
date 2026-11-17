-- B5: truy vấn nóng còn lại ở quy mô hàng chục triệu tin (bổ sung cho explain.sql). Chạy trên CSDL ping_load:
--   META=tools/loadtest/data/meta.json
--   HOT=$(node -p "require('./$META').hotChannelId"); SERVER=$(node -p "require('./$META').serverId")
--   docker exec -i ping-postgres-1 psql -U ping -d ping_load -v hot=$HOT -v server=$SERVER < tools/loadtest/explain-b5.sql
-- Nội dung seed là "tin nhắn thử tải số N lorem ipsum dolor sit amet" (N tăng dần), nên "7654321" là từ hiếm
-- và "lorem" khớp mọi hàng. Câu 4 và 5 là bản SQL của search.service.ts; câu 6 là truy vấn con của read-state.service.ts.

\echo '== Quy mô'
SELECT count(*) AS messages, pg_size_pretty(pg_total_relation_size('"Message"')) AS table_with_indexes,
       pg_size_pretty(pg_relation_size('"Message"')) AS heap FROM "Message";
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE relname = 'Message' ORDER BY pg_relation_size(indexrelid) DESC;

\echo '== 4. Tìm từ HIẾM ("7654321") trong cả server, như search.service.ts (FTS OR ILIKE)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT m.id, m.content FROM "Message" m
JOIN "Channel" c ON c.id = m."channelId"
WHERE c."serverId" = :'server'::uuid AND m."deletedAt" IS NULL
  AND (m.search @@ websearch_to_tsquery('simple', public.f_unaccent('7654321'))
       OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent('7654321') || '%'))
ORDER BY m.id DESC LIMIT 21;

\echo '== 5. Tìm từ PHỔ BIẾN ("lorem", khớp mọi hàng), cùng truy vấn'
EXPLAIN (ANALYZE, BUFFERS)
SELECT m.id, m.content FROM "Message" m
JOIN "Channel" c ON c.id = m."channelId"
WHERE c."serverId" = :'server'::uuid AND m."deletedAt" IS NULL
  AND (m.search @@ websearch_to_tsquery('simple', public.f_unaccent('lorem'))
       OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent('lorem') || '%'))
ORDER BY m.id DESC LIMIT 21;

\echo '== 6. Đếm chưa đọc (trần 100) ở channel nóng, con trỏ đọc nằm giữa lịch sử'
SELECT id AS read_cursor FROM "Message" WHERE "channelId" = :'hot'
ORDER BY id DESC OFFSET 100000 LIMIT 1 \gset
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM (
  SELECT 1 FROM "Message" msg
  WHERE msg."channelId" = :'hot' AND msg."deletedAt" IS NULL
    AND msg."authorId" <> '00000000-0000-0000-0000-000000000000'::uuid
    AND msg.id > :'read_cursor'::uuid
  LIMIT 100) capped;

\echo '== 7. Đếm chưa đọc khi con trỏ rất cũ (mọi hàng đều chưa đọc, trần 100 phải dừng sớm)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM (
  SELECT 1 FROM "Message" msg
  WHERE msg."channelId" = :'hot' AND msg."deletedAt" IS NULL
    AND msg."authorId" <> '00000000-0000-0000-0000-000000000000'::uuid
    AND msg.id > '00000000-0000-0000-0000-000000000000'::uuid
  LIMIT 100) capped;

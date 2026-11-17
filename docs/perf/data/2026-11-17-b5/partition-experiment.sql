-- B5: phân vùng Message theo KHOẢNG id (UUIDv7 tăng theo thời gian) trên BẢN SAO trong schema `exp`; bảng "Message" không bị đụng.
--   docker exec -i ping-postgres-1 psql -U ping -d ping_load -v n=12 < tools/loadtest/partition-experiment.sql
-- Cố ý KHÔNG tạo UNIQUE ("channelId", "authorId", nonce): Postgres bắt khóa duy nhất trên bảng phân vùng phải chứa cột
-- phân vùng (id), nên ràng buộc idempotency của quy tắc 12 không đặt được. Đó là kết luận của thí nghiệm, không phải thiếu sót.
\set ON_ERROR_STOP on
\timing on
CREATE SCHEMA IF NOT EXISTS exp;
DROP TABLE IF EXISTS exp.message_part CASCADE;

CREATE TABLE exp.message_part (
  id uuid NOT NULL,
  "channelId" uuid NOT NULL,
  "authorId" uuid NOT NULL,
  content text NOT NULL,
  "editedAt" timestamp(3),
  "deletedAt" timestamp(3),
  nonce text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, f_unaccent(content))) STORED,
  "replyToId" uuid,
  "pinnedAt" timestamp(3),
  "pinnedById" uuid,
  kind text NOT NULL DEFAULT 'text',
  "stickerId" uuid,
  "gifHeight" integer,
  "gifProvider" text,
  "gifUrl" text,
  "gifWidth" integer,
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);

-- Cận dưới uuid cho một thời điểm: 48 bit đầu của UUIDv7 là mili giây.
CREATE OR REPLACE FUNCTION exp.uuid_floor(ts timestamp) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-7000-8000-000000000000')::uuid
  FROM (SELECT lpad(to_hex((extract(epoch FROM ts) * 1000)::bigint), 12, '0') AS h) x
$$;

\echo '== Khoảng thời gian của dữ liệu'
SELECT min("createdAt") AS t0, max("createdAt") AS t1 FROM "Message" \gset
SELECT :'t0' AS t0, :'t1' AS t1;

SELECT format(
  'CREATE TABLE exp.message_p%s PARTITION OF exp.message_part FOR VALUES FROM (%s) TO (%s)',
  i,
  CASE WHEN i = 0 THEN 'MINVALUE' ELSE quote_literal(exp.uuid_floor(:'t0'::timestamp + (:'t1'::timestamp - :'t0'::timestamp) * i / :n)) END,
  CASE WHEN i = :n - 1 THEN 'MAXVALUE' ELSE quote_literal(exp.uuid_floor(:'t0'::timestamp + (:'t1'::timestamp - :'t0'::timestamp) * (i + 1) / :n)) END
) FROM generate_series(0, :n - 1) AS i \gexec

\echo '== Nạp dữ liệu (cột search tự sinh nên không liệt kê)'
INSERT INTO exp.message_part (id, "channelId", "authorId", content, "editedAt", "deletedAt", nonce, "createdAt",
  "replyToId", "pinnedAt", "pinnedById", kind, "stickerId", "gifHeight", "gifProvider", "gifUrl", "gifWidth")
SELECT id, "channelId", "authorId", content, "editedAt", "deletedAt", nonce, "createdAt",
  "replyToId", "pinnedAt", "pinnedById", kind, "stickerId", "gifHeight", "gifProvider", "gifUrl", "gifWidth"
FROM "Message";

\echo '== Index (trừ khóa duy nhất nonce): cùng bộ index mà các truy vấn đo dùng'
CREATE INDEX ON exp.message_part ("channelId", id DESC);
CREATE INDEX ON exp.message_part USING GIN (search);
CREATE INDEX ON exp.message_part USING GIN (f_unaccent(content) gin_trgm_ops);
ANALYZE exp.message_part;

\echo '== Phân bố hàng theo phân vùng'
SELECT tableoid::regclass AS partition, count(*) AS rows FROM exp.message_part GROUP BY 1 ORDER BY 1;
SELECT pg_size_pretty(pg_total_relation_size('exp.message_part')) AS partitioned_total,
       pg_size_pretty(pg_total_relation_size('"Message"')) AS original_total;

\echo '== Thử đặt lại khóa duy nhất của idempotency (phải lỗi)'
\set ON_ERROR_STOP off
CREATE UNIQUE INDEX ON exp.message_part ("channelId", "authorId", nonce);

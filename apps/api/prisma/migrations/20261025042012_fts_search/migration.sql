-- T4.6 (ADR-0045): FTS + trigram trên chính Postgres, không dịch vụ tìm kiếm ngoài.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() gốc chỉ STABLE nên không dùng được trong generated column / index biểu thức.
-- Wrapper IMMUTABLE là cách làm chuẩn của Postgres (từ điển unaccent chỉ đổi khi admin nâng cấp).
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Cột tsvector sinh: tự cập nhật theo content, tính lại cho mọi hàng hiện có khi ADD COLUMN
-- (khoá bảng lúc chạy — dev dữ liệu nhỏ; production ghi trong runbook migrations).
ALTER TABLE "Message" ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent("content"))) STORED;

CREATE INDEX "Message_search_key" ON "Message" USING GIN ("search");

-- Trigram trên nội dung đã bỏ dấu: đường con-chuỗi (ILIKE '%q%') cho từ con/từ ghép
-- mà FTS cấu hình simple không tách được.
CREATE INDEX "Message_content_trgm_key" ON "Message" USING GIN (f_unaccent("content") gin_trgm_ops);

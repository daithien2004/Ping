-- Expand (rule 13): cột nullable, code cũ bỏ qua. Mang W3C traceparent từ request tạo event tới consumer (ADR-0100).
ALTER TABLE "OutboxEvent" ADD COLUMN "traceparent" TEXT;

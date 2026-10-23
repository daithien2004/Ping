# Bằng chứng T5.4 — Truy xuất vector có kiểm soát quyền

Base: `ecf8fde`. Nhánh: `feat/t5.4-controlled-retrieval`.

## Phạm vi

- ADR-0048: thứ tự xác thực → lọc server → hydrate từ Postgres → fail-closed.
- `apps/api/src/modules/ai/vector-store.port.ts`: thêm `search` + `VectorSearchHit/Options`.
- `apps/api/src/modules/ai/qdrant-vector-store.ts`: `POST /points/search`, lọc payload hỏng/sai server/channel.
- `apps/api/src/modules/ability/ability.factory.ts`: `contextForFresh/createForUserFresh`, tách cache ra `loadContext/cacheContext`.
- `apps/api/src/modules/ai/retrieval/retrieval.service.ts`: `retrieve` với kiểm quyền, kiểm channel, hydrate all messageIds, bỏ chunk nếu bất kỳ tin không hợp lệ.
- `apps/api/src/modules/ai/ai.module.ts`: export `RetrievalService`.
- Unit Qdrant: `apps/api/src/modules/ai/qdrant-vector-store.spec.ts` (9 pass).
- E2E an toàn: `apps/api/test/retrieval.e2e-spec.ts` (9 pass) — không member, kicked (stale cache), thiếu VIEW_CHANNEL, tin đã xóa, payload cross-server, payload hỏng, lọc channel + channel không thuộc server.

## Kết quả

- `pnpm --filter api typecheck` — pass
- `pnpm --filter api lint` — pass
- `pnpm --filter api test` — 18 files / 70 tests pass (thêm Qdrant search)
- `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/retrieval.e2e-spec.ts` — 1 file / 9 tests pass
- `pnpm format:check`, `pnpm docs:check` — xanh

## Ghi chú

- Không có endpoint HTTP mới; dịch vụ nội bộ dùng bởi T5.5/T5.6.
- Cache ability không dùng cho cổng truy xuất; chỉ Postgres xác thực membership/quyền.
- Một chunk chỉ được trả khi toàn bộ `messageIds` hợp lệ — fail-closed theo thiết kế ADR-0048.

#!/usr/bin/env bash
# Kiểm tra migration theo hướng "nâng cấp từ phiên bản trước" (cổng nghiệm thu 16.10, ADR-0032):
#   1. migration đã có ở BASE không bị sửa/xóa/đổi tên (quy tắc 7: không sửa migration đã merge);
#   2. DB trống + migration của BASE (= schema của phiên bản trước) → áp migration của HEAD lên trên → không lệch
#      so với schema.prisma. Đây đúng là điều xảy ra khi deploy bản mới lên DB đang chạy bản trước.
#
#   BASE=<commit> DATABASE_URL=postgresql://... bash scripts/check-migration-upgrade.sh
# DATABASE_URL phải trỏ vào một DB TRỐNG dùng riêng cho phép kiểm tra (script áp migration lên đó).
set -euo pipefail

BASE="${BASE:?cần BASE (commit của phiên bản trước)}"
: "${DATABASE_URL:?cần DATABASE_URL trỏ vào DB trống}"
DIR=apps/api/prisma/migrations
SCHEMA=prisma/schema.prisma

echo "== 1. Migration đã merge không bị sửa (so với ${BASE:0:7})"
# A = thêm mới (được); M/D/R = sửa, xóa, đổi tên migration đã có (không được).
changed=$(git diff --name-status --no-renames "$BASE" HEAD -- "$DIR" | grep -vE '^A\s' || true)
if [ -n "$changed" ]; then
  echo "Migration đã merge bị sửa hoặc xóa:" >&2
  echo "$changed" >&2
  exit 1
fi
echo "ok: chỉ thêm migration mới"

HEAD_COPY=$(mktemp -d)
cp -r "$DIR/." "$HEAD_COPY/"
restore_head() {
  find "$DIR" -mindepth 1 -delete
  cp -r "$HEAD_COPY/." "$DIR/"
}
trap restore_head EXIT

echo "== 2. DB trống + migration của phiên bản trước"
find "$DIR" -mindepth 1 -delete
git archive "$BASE" "$DIR" | tar -x --strip-components=0
pnpm --filter api exec prisma migrate deploy

echo "== 3. Áp migration của phiên bản này lên trên (nâng cấp)"
restore_head
pnpm --filter api exec prisma migrate deploy

echo "== 4. Schema trong code khớp kết quả nâng cấp"
pnpm --filter api exec prisma migrate diff --from-config-datasource --to-schema "$SCHEMA" --exit-code
echo "ok: nâng cấp từ ${BASE:0:7} cho ra đúng schema.prisma"

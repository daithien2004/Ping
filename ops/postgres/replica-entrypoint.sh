#!/usr/bin/env bash
# Replica streaming của Postgres (ADR-0102): lần đầu sao chép primary bằng pg_basebackup, các lần sau chỉ khởi động lại.
# Biến: PRIMARY_HOST, POSTGRES_USER, POSTGRES_PASSWORD. Replica chỉ đọc; khi đổi vai cần quy trình promote riêng (chưa làm).
set -euo pipefail
DATA=/var/lib/postgresql/data
if [ ! -s "$DATA/PG_VERSION" ]; then
  until pg_isready -h "$PRIMARY_HOST" -U "$POSTGRES_USER" >/dev/null 2>&1; do sleep 1; done
  mkdir -p "$DATA" && chown postgres:postgres "$DATA" && chmod 700 "$DATA"
  gosu postgres env PGPASSWORD="$POSTGRES_PASSWORD" pg_basebackup -h "$PRIMARY_HOST" -U "$POSTGRES_USER" -D "$DATA" -R -X stream -c fast
fi
exec docker-entrypoint.sh postgres -c hot_standby=on

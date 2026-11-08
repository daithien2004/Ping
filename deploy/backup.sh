#!/usr/bin/env bash
# Daily local backups of PostgreSQL and uploads. Copy /opt/ping/backups off-host separately.
set -euo pipefail

APP_DIR=/opt/ping
cd "$APP_DIR"
exec 9>.deploy.lock
flock -w 900 9 || { echo 'deployment/backup lock timeout' >&2; exit 1; }
backup_dir="$APP_DIR/backups"
mkdir -p "$backup_dir"
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="$backup_dir/postgres-$stamp.dump"
uploads_file="$backup_dir/uploads-$stamp.tar.gz"

docker compose -p pingprod \
  -f docker-compose.prod.example.yml \
  -f docker-compose.prod.tls.yml \
  --env-file .env.prod --env-file images.env \
  exec -T postgres pg_dump -U ping -Fc ping > "$db_file.part"
mv "$db_file.part" "$db_file"

docker run --rm \
  --mount type=volume,src=pingprod_uploads,dst=/data,readonly \
  --mount "type=bind,src=$backup_dir,dst=/backup" \
  -e BACKUP_UID="$(id -u)" -e BACKUP_GID="$(id -g)" \
  alpine:3.22 sh -c "umask 077; tar -czf '/backup/uploads-$stamp.tar.gz.part' -C /data .; chown \$BACKUP_UID:\$BACKUP_GID '/backup/uploads-$stamp.tar.gz.part'"
mv "$uploads_file.part" "$uploads_file"
find "$backup_dir" -type f \( -name 'postgres-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete
echo "backup complete: $stamp"

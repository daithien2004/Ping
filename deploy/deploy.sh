#!/usr/bin/env bash
# Roll all Ping application images to one immutable commit SHA. Restore the prior SHA on failure.
set -euo pipefail

APP_DIR=/opt/ping
cd "$APP_DIR"
tag="${1:-}"
[[ "$tag" =~ ^[a-f0-9]{40}$ ]] || { echo 'expected a 40-character commit SHA' >&2; exit 2; }

exec 9>.deploy.lock
flock -w 900 9 || { echo 'another deployment is still running' >&2; exit 1; }
if [ -e /run/ping-certbot-restart-nginx ]; then
  echo 'Certbot renewal is using port 80; retry deployment after renewal finishes.' >&2
  exit 1
fi

compose() {
  docker compose -p pingprod \
    -f docker-compose.prod.example.yml \
    -f docker-compose.prod.tls.yml \
    --env-file .env.prod --env-file images.env "$@"
}

# ADR-0097: `compose up` thay mọi bản sao của MỘT service cùng lúc, nên hai bản sao API là hai service (api-1, api-2) và được thay lần lượt;
# bản sao còn lại giữ phục vụ (readiness + SHUTDOWN_GRACE_MS lo việc rút bản sao cũ khỏi Nginx).
roll_up() {
  local wait=(--wait --wait-timeout 180)
  compose up -d "${wait[@]}" migrate worker web
  compose up -d "${wait[@]}" --no-deps api-1
  compose up -d "${wait[@]}" --no-deps api-2
  compose up -d "${wait[@]}" --no-deps realtime-1
  compose up -d "${wait[@]}" nginx
}

previous="$(sed -n 's/^IMAGE_TAG=//p' images.env | tail -n 1)"
set_tag() {
  local value="$1"
  { grep -v '^IMAGE_TAG=' images.env || true; printf 'IMAGE_TAG=%s\n' "$value"; } > images.env.next
  chmod 600 images.env.next
  mv -f images.env.next images.env
}
rollback() {
  local failed_status="$1"
  echo "deployment of $tag failed; previous image tag was ${previous:-<none>}" >&2
  compose logs --tail 80 migrate api-1 api-2 realtime-1 worker web nginx >&2 || true
  if [ -n "$previous" ]; then
    set_tag "$previous"
    if [ "$previous" != bootstrap ]; then
      compose pull migrate api-1 web || true
      roll_up || true
      compose exec -T nginx nginx -t || true
    else
      compose stop api-1 api-2 realtime-1 worker web nginx || true
    fi
  fi
  exit "$failed_status"
}

if ! grep -q '^PUBLIC_URL=https://' .env.prod; then
  echo 'PUBLIC_URL must be an https origin in /opt/ping/.env.prod' >&2
  exit 2
fi
# ADR-0099: .env.prod có từ trước object storage thiếu khóa S3; sinh một lần, giữ nguyên các lần sau.
if ! grep -q '^S3_ACCESS_KEY=' .env.prod; then
  { printf 'S3_ACCESS_KEY=ping%s
' "$(openssl rand -hex 6)"; printf 'S3_SECRET_KEY=%s
' "$(openssl rand -hex 24)"; } >> .env.prod
fi
set_tag "$tag"
compose config -q || rollback $?
compose pull migrate api-1 web || rollback $?
# Validate the new Nginx template and certificate mount before replacing running services.
compose run --rm --no-deps nginx nginx -t || rollback $?
roll_up || rollback $?
compose exec -T nginx nginx -t || rollback $?
docker image prune -f >/dev/null
echo "deployed $tag"

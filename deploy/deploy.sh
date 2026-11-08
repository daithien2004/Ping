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
  compose logs --tail 80 migrate api worker web nginx >&2 || true
  if [ -n "$previous" ]; then
    set_tag "$previous"
    if [ "$previous" != bootstrap ]; then
      compose pull migrate api web || true
      compose up -d --wait --wait-timeout 180 || true
      compose exec -T nginx nginx -t || true
    else
      compose stop api worker web nginx || true
    fi
  fi
  exit "$failed_status"
}

if ! grep -q '^PUBLIC_URL=https://' .env.prod; then
  echo 'PUBLIC_URL must be an https origin in /opt/ping/.env.prod' >&2
  exit 2
fi
set_tag "$tag"
compose config -q || rollback $?
compose pull migrate api web || rollback $?
# Validate the new Nginx template and certificate mount before replacing running services.
compose run --rm --no-deps nginx nginx -t || rollback $?
compose up -d --wait --wait-timeout 180 || rollback $?
compose exec -T nginx nginx -t || rollback $?
docker image prune -f >/dev/null
echo "deployed $tag"

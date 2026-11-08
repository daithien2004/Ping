#!/usr/bin/env bash
# Sync the renewed certificate copy and restart Nginx after standalone HTTP validation.
set -euo pipefail

APP_DIR=/opt/ping
marker=/run/ping-certbot-restart-nginx
cd "$APP_DIR"
if [ -s /etc/letsencrypt/live/"$(sed -n 's/^TLS_CERT_HOST=//p' .env.prod | tail -n 1)"/fullchain.pem ]; then
  /usr/local/bin/ping-cert-sync
fi
if [ ! -e "$marker" ]; then exit 0; fi
exec 9>"$APP_DIR/.deploy.lock"
flock -w 900 9
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
  --env-file .env.prod --env-file images.env up -d --wait --wait-timeout 180 nginx
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
  --env-file .env.prod --env-file images.env exec -T nginx nginx -t
docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml --env-file .env.prod --env-file images.env exec -T nginx nginx -s reload
rm -f "$marker"

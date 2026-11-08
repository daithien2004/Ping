#!/usr/bin/env bash
# Certbot standalone needs port 80. Stop only the Ping proxy if this stack is already running.
set -euo pipefail

APP_DIR=/opt/ping
cd "$APP_DIR"
if [ ! -f .env.prod ] || [ ! -f images.env ]; then exit 0; fi
exec 9>"$APP_DIR/.deploy.lock"
flock -w 900 9
if docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
  --env-file .env.prod --env-file images.env ps --status running --services | grep -qx nginx; then
  touch /run/ping-certbot-restart-nginx
  docker compose -p pingprod -f docker-compose.prod.example.yml -f docker-compose.prod.tls.yml \
    --env-file .env.prod --env-file images.env stop nginx
fi

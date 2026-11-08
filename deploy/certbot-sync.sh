#!/usr/bin/env bash
# Copy only Ping's current certificate/key out of Certbot's symlink tree into the proxy mount.
set -euo pipefail

APP_DIR=/opt/ping
cd "$APP_DIR"
host="$(sed -n 's/^TLS_CERT_HOST=//p' .env.prod | tail -n 1)"
cert_dir="$(sed -n 's/^TLS_CERT_DIR=//p' .env.prod | tail -n 1)"
[[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'invalid TLS_CERT_HOST in .env.prod' >&2; exit 2; }
[[ "$cert_dir" == /opt/ping/tls ]] || { echo 'TLS_CERT_DIR must be /opt/ping/tls' >&2; exit 2; }
source_dir="/etc/letsencrypt/live/$host"
[ -s "$source_dir/fullchain.pem" ] && [ -s "$source_dir/privkey.pem" ] || {
  echo "Certbot certificate is missing for $host" >&2
  exit 1
}

install -d -m 750 -o deploy -g deploy "$cert_dir"
install -m 644 "$source_dir/fullchain.pem" "$cert_dir/fullchain.pem.next"
install -m 640 "$source_dir/privkey.pem" "$cert_dir/privkey.pem.next"
chown deploy:deploy "$cert_dir/fullchain.pem.next" "$cert_dir/privkey.pem.next"
mv -f "$cert_dir/privkey.pem.next" "$cert_dir/privkey.pem"
mv -f "$cert_dir/fullchain.pem.next" "$cert_dir/fullchain.pem"
echo "updated Ping certificate for $host"

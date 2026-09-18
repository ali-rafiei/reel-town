#!/usr/bin/env bash
set -euo pipefail
: "${REELTOWN_PUBLIC_HOST:?Set REELTOWN_PUBLIC_HOST to the HTTPS hostname}"
if [[ ! "$REELTOWN_PUBLIC_HOST" =~ ^[A-Za-z0-9.-]+$ ]]; then echo 'Invalid REELTOWN_PUBLIC_HOST' >&2; exit 1; fi
cd "$(dirname "$0")/.."
if ! id reeltown >/dev/null 2>&1; then sudo useradd --system --home /var/lib/reeltown --shell /usr/sbin/nologin reeltown; fi
operator="$(id -un)"; operator_group="$(id -gn)"
sudo install -d -o "$operator" -g "$operator_group" /opt/reeltown /opt/reeltown/releases
sudo install -d -m 0700 -o reeltown -g reeltown /var/lib/reeltown
sudo install -d -m 0700 /root/reeltown-backups
if [ -f /etc/caddy/Caddyfile ]; then sudo cp -n /etc/caddy/Caddyfile "/root/reeltown-backups/Caddyfile-$(date +%s)"; fi
sudo install -m 0644 deploy/reeltown.service /etc/systemd/system/reeltown.service
sed "s/__REELTOWN_PUBLIC_HOST__/$REELTOWN_PUBLIC_HOST/g" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable reeltown caddy
sudo systemctl restart reeltown
sudo systemctl reload caddy

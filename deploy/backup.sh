#!/usr/bin/env bash
set -euo pipefail
: "${REELTOWN_SSH_KEY:?Set REELTOWN_SSH_KEY to the private key path}"
: "${REELTOWN_SSH_TARGET:?Set REELTOWN_SSH_TARGET to user@host}"
key="$REELTOWN_SSH_KEY"
remote="$REELTOWN_SSH_TARGET"
ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes "$remote" 'sudo install -d -m 0700 /root/reeltown-backups; dest="/root/reeltown-backups/reeltown-$(date -u +%Y%m%dT%H%M%S).sqlite"; sudo sqlite3 /var/lib/reeltown/reeltown.sqlite ".backup $dest"; sudo chmod 600 "$dest"; echo "Backup created: $dest"'

#!/usr/bin/env bash
# Deploys committed source to a new release. Retains the database and the last 3 releases.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${REELTOWN_SSH_KEY:?Set REELTOWN_SSH_KEY to the private key path}"
: "${REELTOWN_SSH_TARGET:?Set REELTOWN_SSH_TARGET to user@host}"
: "${REELTOWN_PUBLIC_HOST:?Set REELTOWN_PUBLIC_HOST to the HTTPS hostname}"
key="$REELTOWN_SSH_KEY"
remote="$REELTOWN_SSH_TARGET"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo 'Commit your code changes before redeploying.' >&2; exit 1; fi
sha="$(git rev-parse HEAD)"
release="$(date -u +%Y%m%dT%H%M%S)-${sha:0:8}"
bundle="$(mktemp -t reeltown-bundle)"
git bundle create "$bundle" HEAD
sshargs=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes)
scp "${sshargs[@]}" "$bundle" "$remote:/tmp/reeltown-$release.bundle"
ssh "${sshargs[@]}" "$remote" bash -s -- "$release" "$sha" "$REELTOWN_PUBLIC_HOST" <<'REMOTE'
set -euo pipefail
release="$1"; sha="$2"; public_host="$3"
operator="$(id -un)"; operator_group="$(id -gn)"
sudo install -d -o "$operator" -g "$operator_group" /opt/reeltown /opt/reeltown/releases
git clone "/tmp/reeltown-$release.bundle" "/opt/reeltown/releases/$release"
rm -f "/tmp/reeltown-$release.bundle"
cd "/opt/reeltown/releases/$release"
git checkout --detach "$sha"
cd server
pnpm import
pnpm install --frozen-lockfile
pnpm run build
cd ..
ln -s "/opt/reeltown/releases/$release" "/opt/reeltown/current-$release"
mv -Tf "/opt/reeltown/current-$release" /opt/reeltown/current
REELTOWN_PUBLIC_HOST="$public_host" bash deploy/server-setup.sh
sleep 2
curl --fail --silent http://127.0.0.1:3001/health
cd /opt/reeltown/releases
ls -1 | sort | head -n -3 | xargs -r rm -rf --
REMOTE
printf '\nServer deployed. Client changes publish through GitHub Pages after a push.\n'

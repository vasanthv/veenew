#!/usr/bin/env bash
#
# Deploy the current origin/main to this droplet. Idempotent — safe to re-run.
# Invoked by .github/workflows/deploy.yml over SSH, and usable by hand.
#
# The droplet is treated as a pure reflection of origin/main: local edits to
# tracked files are discarded. `.env` is gitignored and never touched.

set -euo pipefail

cd /opt/veenew

BEFORE="$(git rev-parse HEAD)"

echo "==> Fetching origin/main"
git fetch --prune origin main
git reset --hard origin/main

AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
	echo "    already at $AFTER"
else
	echo "    $BEFORE -> $AFTER"
fi

# Only the app is rebuilt. Rebuilding caddy would recompile it from Go source,
# which is slow and can OOM on a 1 GB droplet. If caddy/Dockerfile changes,
# rebuild it by hand: docker compose build caddy && docker compose up -d caddy
echo "==> Building app image"
docker compose build app

echo "==> Restarting app"
docker compose up -d app

echo "==> Waiting for health"
healthy=""
for i in $(seq 1 30); do
	if docker compose exec -T app wget -qO- http://127.0.0.1:3000/internal/health >/dev/null 2>&1; then
		healthy="yes"
		echo "    healthy after ${i}s"
		break
	fi
	sleep 1
done

if [ -z "$healthy" ]; then
	echo "!! app did not become healthy — recent logs:" >&2
	docker compose logs --tail 50 app >&2
	exit 1
fi

# Reload Caddy only when its config actually changed, and only after it
# validates — an invalid Caddyfile must never take down TLS for every domain.
if ! git diff --quiet "$BEFORE" "$AFTER" -- Caddyfile; then
	echo "==> Caddyfile changed, validating"
	if docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile; then
		echo "==> Reloading Caddy"
		docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
	else
		echo "!! Caddyfile is invalid — keeping the running config" >&2
		exit 1
	fi
fi

# Keep disk usage in check on a small droplet.
docker image prune -f >/dev/null

echo "==> Deployed $AFTER"

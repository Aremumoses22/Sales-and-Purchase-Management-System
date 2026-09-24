#!/usr/bin/env bash
# Start command for render.free.yaml: runs the API and the web app in one free Render web service.
# The API listens on 127.0.0.1 only, as on a single server (docs/DEPLOYMENT.md); the web app forwards /api/* to it.
set -euo pipefail
cd "$(dirname "$0")/.."

api_port="${API_PORT:-4000}"
# A free instance has 512 MB for both processes; cap each heap so neither grows into the other's share.
api_heap="--max-old-space-size=${API_HEAP_MB:-200}"
web_heap="--max-old-space-size=${WEB_HEAP_MB:-160}"
# Fewer glibc malloc arenas keeps native memory (password hashing, Prisma) from fragmenting across threads.
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"

# Free instances have no pre-deploy step, so migrate and seed here (both are safe to rerun).
(cd apps/api && npx prisma migrate deploy && npx prisma db seed)

(cd apps/api && HOST=127.0.0.1 PORT="$api_port" exec node "$api_heap" dist/main.js) &
(cd apps/web && NODE_OPTIONS="$web_heap" exec node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}") &

# If either process stops, stop the other too and exit, so Render restarts the service.
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
wait -n
exit 1

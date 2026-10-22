#!/usr/bin/env bash
# Local development launcher: starts the Mongo replica set and Next.js with safe local
# defaults. Values from .env.local (if present) take precedence because Next.js loads it.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/db.sh >/dev/null
mkdir -p .data
[ -f .data/dev-secret ] || openssl rand -base64 48 > .data/dev-secret
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/stockpilot?replicaSet=rs0}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(cat .data/dev-secret)}"
export APP_URL="${APP_URL:-http://localhost:${PORT:-3000}}"
export MAIL_SINK="${MAIL_SINK:-file}"
exec npx next dev --port "${PORT:-3000}" "$@"

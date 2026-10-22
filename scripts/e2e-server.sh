#!/usr/bin/env bash
# Starts the production build on :3100 against the e2e database (used by `npm run e2e` locally).
set -euo pipefail
cd "$(dirname "$0")/.."
export MONGODB_URI="${E2E_MONGODB_URI:-mongodb://127.0.0.1:27017/stockpilot_e2e?replicaSet=rs0}"
export BETTER_AUTH_SECRET="$(cat .data/dev-secret)"
export APP_URL=http://localhost:3100 MAIL_SINK=file UPLOAD_DIR=.data/e2e-uploads NIC_EXTRA_HOSTS=127.0.0.1:4555
exec npx next start -p 3100

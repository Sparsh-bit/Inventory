#!/usr/bin/env bash
# Prints the Railway variables block with fresh secrets. Paste it into
# Railway → service → Variables → Raw Editor, then fill in the REPLACE_ME values.
set -euo pipefail
cat <<VARS
MONGODB_URI=REPLACE_ME_with_your_Atlas_string
BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ENCRYPTION_KEY=$(openssl rand -base64 48 | tr -d '\n')
RESEND_API_KEY=REPLACE_ME_with_your_re_key
MAIL_FROM="StockPilot <no-reply@REPLACE_ME_your_verified_domain>"
UPLOAD_DIR=/data/uploads
RAILWAY_RUN_UID=0
NODE_ENV=production
VARS

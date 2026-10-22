#!/usr/bin/env bash
# Dev server over HTTPS on your Wi-Fi address so a phone can use its camera to scan.
# Phones only allow camera access on https pages; this makes a self-signed certificate
# for localhost + this computer's LAN IP. Open the printed address on BOTH the laptop and phone.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/db.sh >/dev/null
IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$IP" ] || { echo "Could not detect your Wi-Fi IP. Run: LAN_IP=192.168.x.x npm run dev:phone"; exit 1; }
mkdir -p .data/certs
CERT=.data/certs/dev.pem KEY=.data/certs/dev-key.pem
if [ ! -f "$CERT" ] || ! openssl x509 -in "$CERT" -noout -text | grep -q "IP Address:$IP"; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=StockPilot dev" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP" -keyout "$KEY" -out "$CERT" 2>/dev/null
fi
[ -f .data/dev-secret ] || openssl rand -base64 48 > .data/dev-secret
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/stockpilot?replicaSet=rs0}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(cat .data/dev-secret)}"
export APP_URL="https://$IP:${PORT:-3000}"
export MAIL_SINK="${MAIL_SINK:-file}"
echo ""
echo "  Open on laptop AND phone (same Wi-Fi):  $APP_URL"
echo "  The browser will warn about the certificate once: choose Advanced → Proceed."
echo ""
exec npx next dev --hostname "$IP" --port "${PORT:-3000}" --experimental-https --experimental-https-key "$KEY" --experimental-https-cert "$CERT"

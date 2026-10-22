#!/usr/bin/env bash
# Starts a local single-node MongoDB replica set (transactions need a replica set).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data/db
if ! mongosh --quiet --port 27017 --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
  nohup mongod --dbpath .data/db --replSet rs0 --port 27017 --bind_ip 127.0.0.1 --logpath .data/mongod.log >/dev/null 2>&1 &
  for _ in $(seq 1 30); do
    mongosh --quiet --port 27017 --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
mongosh --quiet --port 27017 --eval '
try { rs.status().ok } catch (e) {
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })
}' >/dev/null
echo "MongoDB replica set rs0 running on mongodb://127.0.0.1:27017/?replicaSet=rs0"

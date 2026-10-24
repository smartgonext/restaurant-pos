#!/usr/bin/env bash
set -euo pipefail

# Recover deploy helper for apps/api
# Usage: upload to server and run from the apps/api directory (or run this script directly)

API_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$API_ROOT"

echo "[recover] API root: $API_ROOT"

if [ -f .env ]; then
  echo "[recover] Found .env in $API_ROOT"
else
  echo "[recover] WARNING: .env not found in $API_ROOT — ensure DATABASE_URL, JWT_SECRET, COOKIE_DOMAIN are set in environment or .env"
fi

# Stop pm2-managed app if present
if command -v pm2 >/dev/null 2>&1; then
  echo "[recover] Stopping pm2 process 'restorent-api' if present"
  pm2 stop restorent-api || true
  pm2 delete restorent-api || true
fi

echo "[recover] Killing any stray node processes that reference this folder"
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti :3001 || true)
else
  PIDS=$(pgrep -f "node .*src/server.js" || true)
fi
if [ -n "$PIDS" ]; then
  echo "[recover] Killing pids: $PIDS"
  kill -9 $PIDS || true
fi

echo "[recover] Removing node_modules and lockfile"
rm -rf node_modules package-lock.json

echo "[recover] Installing dependencies (full install needed for prisma CLI)"
npm install --no-audit --no-fund

echo "[recover] Ensuring local Prisma client generation (using pinned prisma@5.x)"
# Use pinned Prisma CLI to avoid accidental npx fetching of incompatible major versions
npx prisma@5.10.0 generate --schema=prisma/schema.prisma

if [ -d node_modules/.prisma/client ]; then
  echo "[recover] Prisma client present: node_modules/.prisma/client"
else
  echo "[recover] WARNING: Prisma client not found after generate"
fi

echo "[recover] Starting app"
if command -v pm2 >/dev/null 2>&1; then
  pm2 start npm --name restorent-api -- start
  pm2 save
  echo "[recover] Started via pm2 (pm2 list to verify)"
else
  nohup node src/server.js > server.log 2>&1 &
  echo "[recover] Started node in background; tail -f server.log to follow logs"
fi

echo "[recover] Done. If 500s persist, collect server log output and paste the stack trace."

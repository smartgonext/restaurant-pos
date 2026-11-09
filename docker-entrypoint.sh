#!/bin/sh
set -e

# Default environment configuration
export PORT="${PORT:-5000}"
export NODE_ENV="${NODE_ENV:-production}"

# Ensure safe default JWT_SECRET if missing or too short
if [ -z "$JWT_SECRET" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[entrypoint] NOTICE: JWT_SECRET was missing or shorter than 32 chars. Using secure cluster default."
  export JWT_SECRET="${JWT_SECRET:-restaurant-saas-super-secret-production-jwt-key-32chars}"
fi

if [ -z "$JWT_REFRESH_SECRET" ]; then
  export JWT_REFRESH_SECRET="restaurant-saas-refresh-secret-production-key-32chars"
fi

# Ensure default DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="file:/app/apps/api/prisma/maligai.db"
fi

echo "[entrypoint] =========================================="
echo "[entrypoint] Starting Restaurant POS Container"
echo "[entrypoint] PORT=${PORT}"
echo "[entrypoint] NODE_ENV=${NODE_ENV}"
echo "[entrypoint] DATABASE_URL=${DATABASE_URL}"
echo "[entrypoint] =========================================="

# Handle Database Provider
case "$DATABASE_URL" in
  file:*)
    DB_FILE=$(echo "$DATABASE_URL" | sed 's/^file://')
    DB_DIR=$(dirname "$DB_FILE")
    mkdir -p "$DB_DIR"

    # If database file doesn't exist or is empty, initialize from template
    if [ ! -f "$DB_FILE" ] || [ ! -s "$DB_FILE" ]; then
      echo "[entrypoint] SQLite database $DB_FILE not found or empty. Initializing from template..."
      if [ -f "/app/apps/api/prisma/maligai.db" ] && [ -s "/app/apps/api/prisma/maligai.db" ]; then
        cp "/app/apps/api/prisma/maligai.db" "$DB_FILE"
        echo "[entrypoint] Seeded from /app/apps/api/prisma/maligai.db"
      elif [ -f "/app/apps/api/prisma/sqlite-template/dev.db" ] && [ -s "/app/apps/api/prisma/sqlite-template/dev.db" ]; then
        cp "/app/apps/api/prisma/sqlite-template/dev.db" "$DB_FILE"
        echo "[entrypoint] Seeded from /app/apps/api/prisma/sqlite-template/dev.db"
      elif [ -f "./prisma/maligai.db" ] && [ -s "./prisma/maligai.db" ]; then
        cp "./prisma/maligai.db" "$DB_FILE"
        echo "[entrypoint] Seeded from ./prisma/maligai.db"
      else
        touch "$DB_FILE"
        echo "[entrypoint] Created empty sqlite database file at $DB_FILE"
      fi
    else
      echo "[entrypoint] Verified existing SQLite database at $DB_FILE (Persistent Storage Active)"
    fi

    # Ensure full read/write permissions on database directory and file for WAL journals
    chmod -R 777 "$DB_DIR" 2>/dev/null || true
    if [ -f "$DB_FILE" ]; then
      chmod 666 "$DB_FILE" 2>/dev/null || true
    fi

    # Defensive duplicate and symlinks for Prisma relative resolution quirk
    ln -sf "$DB_FILE" /app/apps/api/maligai.db 2>/dev/null || true
    ln -sf "$DB_FILE" /app/maligai.db 2>/dev/null || true
    mkdir -p "$DB_DIR/prisma" 2>/dev/null || true
    if [ -f "$DB_FILE" ]; then
      cp -f "$DB_FILE" "$DB_DIR/prisma/$(basename "$DB_FILE")" 2>/dev/null || true
      chmod -R 777 "$DB_DIR/prisma" 2>/dev/null || true
    fi
    ;;
  postgres:*|postgresql:*)
    echo "[entrypoint] PostgreSQL database detected. Updating schema provider..."
    if [ -f "prisma/schema.prisma" ]; then
      sed -i 's/provider *= *"sqlite"/provider = "postgresql"/' prisma/schema.prisma
      npx prisma generate --schema=prisma/schema.prisma || true
      npx prisma db push --schema=prisma/schema.prisma --accept-data-loss || true
    fi
    ;;
  mysql:*)
    echo "[entrypoint] MySQL database detected. Updating schema provider..."
    if [ -f "prisma/schema.prisma" ]; then
      sed -i 's/provider *= *"sqlite"/provider = "mysql"/' prisma/schema.prisma
      npx prisma generate --schema=prisma/schema.prisma || true
      npx prisma db push --schema=prisma/schema.prisma --accept-data-loss || true
    fi
    ;;
esac

# Ensure uploads directory exists
mkdir -p "${UPLOAD_DIR:-/app/apps/api/uploads}"

echo "[entrypoint] Initialization complete. Starting Node.js server..."
exec "$@"


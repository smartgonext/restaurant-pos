# ==============================================================================
# Restaurant SaaS POS - Multi-stage Production Dockerfile
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Web Frontend (React Vite SPA)
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS web-builder
WORKDIR /app

# Copy shared packages and web frontend source
COPY packages/ ./packages/
COPY apps/shared/ ./apps/shared/
COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web

# Build frontend SPA
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Install API & Generate Prisma Client
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS api-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/package*.json ./apps/api/
COPY apps/api/prisma/ ./apps/api/prisma/

WORKDIR /app/apps/api

# Install dependencies and pre-generate Prisma Client
ENV DATABASE_URL="file:/app/apps/api/prisma/maligai.db"
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npx prisma generate --schema=prisma/schema.prisma

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install runtime dependencies (OpenSSL for Prisma, curl for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Runtime environment defaults (overridable in Coolify / Docker Compose / Kubernetes)
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/apps/api/prisma/maligai.db"
ENV JWT_SECRET="restaurant-saas-super-secret-production-jwt-key-32chars"
ENV JWT_REFRESH_SECRET="restaurant-saas-refresh-secret-production-key-32chars"
ENV UPLOAD_DIR="/app/apps/api/uploads"
ENV WEB_DIST_PATH="/app/apps/web/dist"

# Copy API runtime from builder & source
COPY --from=api-builder /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/ ./apps/api/

# Copy built frontend SPA from web-builder
COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Ensure prisma, uploads, and data directories exist
RUN mkdir -p /app/apps/api/prisma /app/apps/api/uploads /app/data

WORKDIR /app/apps/api

EXPOSE 5000 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

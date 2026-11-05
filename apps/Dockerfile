# ==============================================================================
# Restaurant SaaS POS - Dockerfile (for /apps base directory)
# ==============================================================================

# Stage 1: Build Web
FROM node:20-bookworm-slim AS web-builder
WORKDIR /app
COPY shared/ ./shared/
COPY web/ ./web/
WORKDIR /app/web
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npm run build

# Stage 2: Build API
FROM node:20-bookworm-slim AS api-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY api/package*.json ./api/
COPY api/prisma/ ./api/prisma/
WORKDIR /app/api
ENV DATABASE_URL="file:/app/api/prisma/maligai.db"
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npx prisma generate --schema=prisma/schema.prisma

# Stage 3: Runner
FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/api/prisma/maligai.db"
ENV JWT_SECRET="restaurant-saas-super-secret-production-jwt-key-32chars"
ENV JWT_REFRESH_SECRET="restaurant-saas-refresh-secret-production-key-32chars"
ENV UPLOAD_DIR="/app/api/uploads"
ENV WEB_DIST_PATH="/app/web/dist"

COPY --from=api-builder /app/api/node_modules ./api/node_modules
COPY api/ ./api/
COPY --from=web-builder /app/web/dist ./web/dist

WORKDIR /app/api

EXPOSE 5000 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "src/server.js"]


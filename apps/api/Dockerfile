# ==============================================================================
# Restaurant SaaS POS API - Standalone Dockerfile (for apps/api base directory)
# ==============================================================================
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/prisma/maligai.db"
ENV JWT_SECRET="restaurant-saas-super-secret-production-jwt-key-32chars"
ENV JWT_REFRESH_SECRET="restaurant-saas-refresh-secret-production-key-32chars"
ENV UPLOAD_DIR="/app/uploads"

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm install --ignore-scripts --no-audit --no-fund
RUN npx prisma generate --schema=prisma/schema.prisma

COPY . .

# Seed maligai.db from template if missing
RUN if [ ! -f "prisma/maligai.db" ] && [ -f "prisma/sqlite-template/dev.db" ]; then \
      cp prisma/sqlite-template/dev.db prisma/maligai.db; \
    fi

EXPOSE 5000 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "src/server.js"]


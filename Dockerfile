# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps with lockfile-strict reproducibility
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Migrations need source (TypeScript) — copy migrations dir as-is
COPY src/db/migrations ./src/db/migrations
COPY tsconfig.migrate.json ./

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Add wget for HEALTHCHECK (alpine doesn't have it by default)
RUN apk add --no-cache wget

# Use the unprivileged `node` user that ships with the image
USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

# Default command: start the gateway (Coolify can override CMD for the workers service)
CMD ["node", "dist/gateway/server.js"]

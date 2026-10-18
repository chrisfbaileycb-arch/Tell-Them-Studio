# syntax=docker/dockerfile:1

# =============================================================
# Stage 1: Builder (Vite static bundle & assets)
# =============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies using deterministic lockfile
COPY package.json package-lock.json ./
RUN npm ci

# Copy full source and build production Vite distribution
COPY . .
RUN npm run build

# =============================================================
# Stage 2: Production Runner (Zero Localhost Cloud Runtime)
# =============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server and backend code
COPY server.ts ./
COPY src/ ./src/
COPY types.ts ./
COPY constants.tsx ./
COPY tsconfig.json ./

# Switch to non-root unprivileged user for cloud security
USER node

EXPOSE 8080

# Cloud container healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8080}/api/health || exit 1

CMD ["node", "--import", "tsx", "server.ts"]

# ARISE API — Production Dockerfile (multi-stage)
# Dev: pakai docker-compose.yml (Postgres+Redis only, NestJS run di host).
# Prod: build image ini, deploy ke server self-host di belakang Caddy.

# ─────────────────────────────────────────────────────────────
# Stage 1: deps (cache layer)
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN pnpm prisma generate
RUN pnpm build
RUN pnpm prune --prod

# ─────────────────────────────────────────────────────────────
# Stage 3: runtime (minimal)
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Run as non-root
RUN addgroup -S arise && adduser -S arise -G arise

COPY --from=build --chown=arise:arise /app/node_modules ./node_modules
COPY --from=build --chown=arise:arise /app/dist ./dist
COPY --from=build --chown=arise:arise /app/prisma ./prisma
COPY --from=build --chown=arise:arise /app/package.json ./package.json

USER arise
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/v1/health || exit 1

CMD ["node", "dist/main.js"]

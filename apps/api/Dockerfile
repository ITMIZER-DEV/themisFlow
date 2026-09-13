# CONTEXTO: raiz do monorepo (necessário para acessar packages/core)
# ── Stage 1: Validação de tipos ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

COPY packages/core ./packages/core
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# ── Stage 2: Desenvolvimento (hot-reload com tsx) ────────────────────────────
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
WORKDIR /app/apps/api
COPY apps/api/src ./src
COPY apps/api/prisma ./prisma
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ── Stage 3: Produção (tsx resolve @themisflow/core em runtime) ───────────────
FROM node:20-alpine AS prod
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev

# packages/core/src é importado em runtime pelo tsx (resolve .ts nativamente)
COPY packages/core/src ./packages/core/src
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma

# Gera Prisma Client a partir do root — node_modules/prisma/ existe aqui
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
RUN chmod +x ./apps/api/entrypoint.sh

# Workdir final: caminhos relativos no entrypoint.sh resolvem corretamente
WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/app/apps/api/entrypoint.sh"]

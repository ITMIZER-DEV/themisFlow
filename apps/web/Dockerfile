# ── Stage 1: Build Vite ────────────────────────────────────────────────────
# CONTEXTO: raiz do monorepo (necessário para acessar packages/core)
FROM node:20-alpine AS builder
WORKDIR /app

# Copia manifests do monorepo para instalar corretamente
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Instala todas as dependências do workspace
RUN npm ci

# Copia código-fonte
COPY packages/core ./packages/core
COPY apps/web/src ./apps/web/src
COPY apps/web/index.html ./apps/web/
COPY apps/web/vite.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/tsconfig.app.json ./apps/web/
COPY apps/web/tsconfig.node.json ./apps/web/
COPY apps/web/nginx.conf ./apps/web/

# Build de produção do Vite
WORKDIR /app/apps/web
RUN npm run build

# ── Stage 2: Nginx Alpine ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS prod

# Remove configuração padrão
RUN rm /etc/nginx/conf.d/default.conf

# Copia configuração customizada do builder (onde o contexto ainda existe)
COPY --from=builder /app/apps/web/nginx.conf /etc/nginx/conf.d/themisflow.conf

# Copia o build Vite gerado
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

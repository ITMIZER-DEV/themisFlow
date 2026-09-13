#!/usr/bin/env bash
# ==============================================================================
# ThemisFlow — Gerador de Pacote ZIP para Portainer & Cliente Piloto (Bash)
# ==============================================================================
set -e

OUTPUT_FILE="${1:-themisflow-deploy-pilot.zip}"
PILOT_NAME="${2:-Supermercado Piloto}"
ADMIN_EMAIL="${3:-admin@themisflow.local}"
ADMIN_SENHA="${4:-ThemisFlow@2026}"
OPERADOR_EMAIL="${5:-operador@themisflow.local}"
OPERADOR_SENHA="${6:-Operador@2026}"

echo "═════════════════════════════════════════════════════════════════"
echo "  ThemisFlow — Gerando Pacote ZIP para Deploy (Cliente Piloto)"
echo "═════════════════════════════════════════════════════════════════"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
STAGING_DIR="$ROOT_DIR/_deploy_staging"
ZIP_PATH="$ROOT_DIR/$OUTPUT_FILE"

rm -rf "$STAGING_DIR" "$ZIP_PATH"
mkdir -p "$STAGING_DIR"

echo "[1/5] Preparando arquivos essenciais da raiz..."
cp "$ROOT_DIR/package.json" "$STAGING_DIR/"
cp "$ROOT_DIR/package-lock.json" "$STAGING_DIR/"
cp "$ROOT_DIR/.dockerignore" "$STAGING_DIR/"
cp "$ROOT_DIR/start-stack.sh" "$STAGING_DIR/"
cp "$ROOT_DIR/start-stack.ps1" "$STAGING_DIR/"
cp "$ROOT_DIR/docker-compose.portainer-mvp.yml" "$STAGING_DIR/"
cp "$ROOT_DIR/docker-compose.portainer-webeditor.yml" "$STAGING_DIR/"
cp "$ROOT_DIR/GUIA-PORTAINER-MVP.md" "$STAGING_DIR/"
cp "$ROOT_DIR/.env.pilot.example" "$STAGING_DIR/"
cp "$ROOT_DIR/docker-compose.portainer-mvp.yml" "$STAGING_DIR/docker-compose.yml"

echo "[2/5] Gerando arquivo .env para o cliente piloto..."
cat <<EOF > "$STAGING_DIR/.env"
# ══════════════════════════════════════════════════════════════════════════════
# ThemisFlow — .env (Configuração de Produção para o Cliente Piloto)
# ══════════════════════════════════════════════════════════════════════════════

PILOT_CLIENT_NAME=$PILOT_NAME
PILOT_CLIENT_CNPJ=

POSTGRES_DB=themisflow
POSTGRES_USER=itmizer
POSTGRES_PASSWORD=Th3m1s_DB_2026!
POSTGRES_PORT=5432

JWT_SECRET=7f2c1b9e4a8d3f6c0e5b2a9d1f8c7e4b3a6d9f2c1b8e5a3d7f0c4b2e9a1d6c

ADMIN_NOME=Administrador ($PILOT_NAME)
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_SENHA=$ADMIN_SENHA

OPERADOR_NOME=Operador Financeiro ($PILOT_NAME)
OPERADOR_EMAIL=$OPERADOR_EMAIL
OPERADOR_SENHA=$OPERADOR_SENHA

NODE_ENV=production
CORS_ORIGIN=*
EOF

echo "[3/5] Copiando packages/core..."
mkdir -p "$STAGING_DIR/packages/core"
cp "$ROOT_DIR/packages/core/package.json" "$STAGING_DIR/packages/core/"
cp "$ROOT_DIR/packages/core/tsconfig.json" "$STAGING_DIR/packages/core/"
cp -r "$ROOT_DIR/packages/core/src" "$STAGING_DIR/packages/core/"

echo "[4/5] Copiando apps/api e apps/web..."
mkdir -p "$STAGING_DIR/apps/api"
cp "$ROOT_DIR/apps/api/Dockerfile" "$STAGING_DIR/apps/api/"
cp "$ROOT_DIR/apps/api/entrypoint.sh" "$STAGING_DIR/apps/api/"
cp "$ROOT_DIR/apps/api/package.json" "$STAGING_DIR/apps/api/"
cp "$ROOT_DIR/apps/api/tsconfig.json" "$STAGING_DIR/apps/api/"
cp -r "$ROOT_DIR/apps/api/prisma" "$STAGING_DIR/apps/api/"
cp -r "$ROOT_DIR/apps/api/src" "$STAGING_DIR/apps/api/"

mkdir -p "$STAGING_DIR/apps/web"
cp "$ROOT_DIR/apps/web/Dockerfile" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/nginx.conf" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/package.json" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/tsconfig.json" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/tsconfig.app.json" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/tsconfig.node.json" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/vite.config.ts" "$STAGING_DIR/apps/web/"
cp "$ROOT_DIR/apps/web/index.html" "$STAGING_DIR/apps/web/"
cp -r "$ROOT_DIR/apps/web/src" "$STAGING_DIR/apps/web/"
if [ -d "$ROOT_DIR/apps/web/public" ]; then
  cp -r "$ROOT_DIR/apps/web/public" "$STAGING_DIR/apps/web/"
fi

# Converte CRLF para LF
sed -i 's/\r$//' "$STAGING_DIR/apps/api/entrypoint.sh" "$STAGING_DIR/start-stack.sh"

echo "[5/5] Compactando para $OUTPUT_FILE..."
(cd "$STAGING_DIR" && zip -r -q "$ZIP_PATH" .)
rm -rf "$STAGING_DIR"

echo "✓ Pacote ZIP gerado com sucesso em: $ZIP_PATH"

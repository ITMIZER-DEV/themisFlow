#!/bin/sh
# entrypoint.sh — roda na inicialização do container api (prod)
# Ordem: aguarda db → migrate → seed (idempotente, usa tsx) → start server
set -e

echo "▶ [ThemisFlow API] Conectando ao banco de dados e aplicando migrações..."
MAX_TRIES=25
COUNT=0
until npx prisma migrate deploy || [ $COUNT -eq $MAX_TRIES ]; do
  COUNT=$((COUNT + 1))
  echo "  [ThemisFlow API] Banco ainda indisponível. Tentando novamente em 2s ($COUNT/$MAX_TRIES)..."
  sleep 2
done

if [ $COUNT -eq $MAX_TRIES ]; then
  echo "✖ [ThemisFlow API] Erro: não foi possível conectar ao banco após $MAX_TRIES tentativas."
  exit 1
fi

echo "▶ [ThemisFlow API] Rodando seed (idempotente)..."
npx tsx prisma/seed.ts

echo "▶ [ThemisFlow API] Iniciando servidor..."
exec npx tsx src/server.ts


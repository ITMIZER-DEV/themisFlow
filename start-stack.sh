#!/usr/bin/env bash
# ==============================================================================
# ThemisFlow — Script de Inicialização da Stack (Docker / Portainer Host)
# ==============================================================================
set -e

echo "═════════════════════════════════════════════════════════════════"
echo "  ThemisFlow — Inicializando Stack para o Cliente Piloto"
echo "═════════════════════════════════════════════════════════════════"

# Cria .env a partir do modelo se não existir
if [ ! -f .env ]; then
  if [ -f .env.pilot.example ]; then
    echo "▶ Criando .env a partir de .env.pilot.example..."
    cp .env.pilot.example .env
  fi
fi

echo "▶ Subindo containers via Docker Compose (build local)..."
docker compose -f docker-compose.portainer-mvp.yml up -d --build

echo ""
echo "✓ Stack iniciada com sucesso!"
echo "-----------------------------------------------------------------"
echo "Acompanhe a inicialização do banco e seed com o comando:"
echo "  docker logs -f themisflow-api"
echo "-----------------------------------------------------------------"
echo "Acesse a aplicação no navegador em: http://localhost (ou IP do servidor)"
echo ""

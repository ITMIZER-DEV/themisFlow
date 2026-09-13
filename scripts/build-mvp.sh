#!/usr/bin/env bash
# ==============================================================================
# ThemisFlow — Build & Empacotamento MVP para Docker e Portainer (Bash / Linux)
# ==============================================================================
set -e

echo "======================================================"
echo "  ThemisFlow — Build & Empacotamento MVP para Docker   "
echo "======================================================"
echo ""

# 1. Verifica se o Docker está ativo
echo "[1/4] Verificando Docker daemon..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está em execução ou o usuário não tem permissão."
    echo "   Inicie o serviço Docker e tente novamente."
    exit 1
fi
echo "✓ Docker está ativo e pronto!"

# 2. Build da imagem da API
echo ""
echo "[2/4] Construindo imagem themisflow-api:mvp..."
docker build -f apps/api/Dockerfile --target prod -t themisflow-api:mvp .
echo "✓ Imagem themisflow-api:mvp construída com sucesso!"

# 3. Build da imagem do Frontend Web
echo ""
echo "[3/4] Construindo imagem themisflow-web:mvp..."
docker build -f apps/web/Dockerfile --target prod -t themisflow-web:mvp .
echo "✓ Imagem themisflow-web:mvp construída com sucesso!"

# 4. Exportação
echo ""
echo "[4/4] Finalização..."
read -p "Deseja salvar as imagens em 'themisflow-mvp-images.tar.gz' para envio ao servidor? (S/n) " resp
resp=${resp:-S}

if [[ "$resp" =~ ^[SsYy]$ ]]; then
    TAR_FILE="themisflow-mvp-images.tar.gz"
    echo "▶ Salvando e compactando imagens em $TAR_FILE..."
    docker save themisflow-api:mvp themisflow-web:mvp | gzip > "$TAR_FILE"
    echo "✓ Arquivo $TAR_FILE gerado com sucesso!"
    echo ""
    echo "------------------------------------------------------"
    echo "COMO ENVIAR AO PORTAINER:"
    echo "1. Transfira '$TAR_FILE' para o servidor."
    echo "2. No servidor, execute:"
    echo "   docker load < $TAR_FILE"
    echo "3. No Portainer (Web Editor), cole o conteúdo de:"
    echo "   docker-compose.portainer-webeditor.yml"
    echo "4. Clique em 'Deploy the stack'!"
    echo "------------------------------------------------------"
else
    echo "✓ Imagens prontas no Docker local!"
    echo "  Para subir localmente: docker compose -f docker-compose.portainer-mvp.yml up -d"
fi

echo ""
echo "Concluído!"

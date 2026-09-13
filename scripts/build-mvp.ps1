# ==============================================================================
# ThemisFlow - Build e Empacotamento MVP para Docker e Portainer (PowerShell)
# ==============================================================================
param(
    [switch]$ExportTar = $false,
    [switch]$RunLocal  = $false
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  ThemisFlow - Build das Imagens Docker para Portainer" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica se o Docker esta ativo
Write-Host "[1/4] Verificando Docker daemon..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker nao respondeu."
    }
    Write-Host "Docker esta ativo e pronto!" -ForegroundColor Green
} catch {
    Write-Host "Docker nao esta em execucao ou nao foi detectado." -ForegroundColor Red
    exit 1
}

# 2. Build da imagem da API
Write-Host ""
Write-Host "[2/4] Construindo imagem themisflow-api:mvp..." -ForegroundColor Yellow
docker build -f apps/api/Dockerfile --target prod -t themisflow-api:mvp .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha no build da API!" -ForegroundColor Red
    exit 1
}
Write-Host "Imagem themisflow-api:mvp construida com sucesso!" -ForegroundColor Green

# 3. Build da imagem do Frontend Web
Write-Host ""
Write-Host "[3/4] Construindo imagem themisflow-web:mvp..." -ForegroundColor Yellow
docker build -f apps/web/Dockerfile --target prod -t themisflow-web:mvp .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha no build do Frontend!" -ForegroundColor Red
    exit 1
}
Write-Host "Imagem themisflow-web:mvp construida com sucesso!" -ForegroundColor Green

# 4. Acao Final: Exportar Tarball ou Rodar Local
Write-Host ""
Write-Host "[4/4] Finalizacao..." -ForegroundColor Yellow

if ($RunLocal) {
    Write-Host "Iniciando stack localmente com docker compose..." -ForegroundColor Cyan
    docker compose -f docker-compose.portainer-mvp.yml up -d
    Write-Host "ThemisFlow iniciado com sucesso!" -ForegroundColor Green
    Write-Host "Acesse no navegador: http://localhost:8098" -ForegroundColor Cyan
    exit 0
}

$tarFile = "themisflow-mvp-images.tar"
Write-Host "Salvando imagens em $tarFile..." -ForegroundColor Cyan
docker save themisflow-api:mvp themisflow-web:mvp -o $tarFile

if (Test-Path $tarFile) {
    $fileSizeMB = [math]::Round((Get-Item $tarFile).Length / 1MB, 2)
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host " Arquivo $tarFile gerado com sucesso! ($fileSizeMB MB)" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "COMO FAZER UPLOAD NO PORTAINER:" -ForegroundColor Yellow
    Write-Host "1. No Portainer, va em: Images -> Import" -ForegroundColor White
    Write-Host "2. Selecione o arquivo: $tarFile" -ForegroundColor Cyan
    Write-Host "3. Clique em 'Upload' / 'Import image'" -ForegroundColor Green
    Write-Host "4. Em seguida, va em Stacks -> Add stack -> Web editor" -ForegroundColor White
    Write-Host "5. Cole o conteudo de 'docker-compose.portainer-webeditor.yml'" -ForegroundColor White
    Write-Host "6. Clique em 'Deploy the stack'!" -ForegroundColor Green
}

Write-Host "Concluido com sucesso!" -ForegroundColor Green

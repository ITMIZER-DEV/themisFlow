# ==============================================================================
# ThemisFlow — Script de Inicialização da Stack (PowerShell)
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ThemisFlow — Inicializando Stack para o Cliente Piloto         " -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.pilot.example") {
        Write-Host "▶ Criando .env a partir de .env.pilot.example..." -ForegroundColor Yellow
        Copy-Item ".env.pilot.example" ".env"
    }
}

Write-Host "▶ Subindo containers via Docker Compose (build local)..." -ForegroundColor Yellow
docker compose -f docker-compose.portainer-mvp.yml up -d --build

Write-Host ""
Write-Host "✓ Stack iniciada com sucesso!" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Acompanhe a inicialização do banco e seed com o comando:" -ForegroundColor White
Write-Host "  docker logs -f themisflow-api" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Acesse a aplicação no navegador em: http://localhost (ou IP do servidor)" -ForegroundColor White
Write-Host ""

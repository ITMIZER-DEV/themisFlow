# ==============================================================================
# ThemisFlow — Gerador de Pacote ZIP para Portainer & Cliente Piloto
# ==============================================================================
param(
    [string]$OutputFile = "themisflow-deploy-pilot.zip",
    [string]$PilotName = "Supermercado Piloto",
    [string]$AdminEmail = "admin@themisflow.local",
    [string]$AdminSenha = "ThemisFlow@2026",
    [string]$OperadorEmail = "operador@themisflow.local",
    [string]$OperadorSenha = "Operador@2026"
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  ThemisFlow - Gerando Pacote ZIP para Deploy (Cliente Piloto)   " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = (Get-Item $PSScriptRoot).Parent.FullName
$zipPath = Join-Path $rootDir $OutputFile
$stagingDir = Join-Path $rootDir "_deploy_staging"

# 1. Limpa resquicios anteriores
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Path $stagingDir | Out-Null

Write-Host "[1/5] Preparando arquivos essenciais da raiz..." -ForegroundColor Yellow

$rootFiles = @(
    "package.json",
    "package-lock.json",
    ".dockerignore",
    "start-stack.sh",
    "start-stack.ps1",
    "docker-compose.portainer-mvp.yml",
    "docker-compose.portainer-webeditor.yml",
    "GUIA-PORTAINER-MVP.md",
    ".env.pilot.example"
)

foreach ($rf in $rootFiles) {
    $src = Join-Path $rootDir $rf
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $stagingDir
    }
}

# Define docker-compose.yml padrao para execucao direta do MVP
Copy-Item -Path (Join-Path $rootDir "docker-compose.portainer-mvp.yml") -Destination (Join-Path $stagingDir "docker-compose.yml")

Write-Host "[2/5] Gerando arquivo .env para o cliente piloto..." -ForegroundColor Yellow
$envLines = @(
    "# ThemisFlow - .env (Cliente Piloto)",
    "PILOT_CLIENT_NAME=$PilotName",
    "PILOT_CLIENT_CNPJ=",
    "",
    "POSTGRES_DB=themisflow",
    "POSTGRES_USER=itmizer",
    "POSTGRES_PASSWORD=Th3m1s_DB_2026!",
    "POSTGRES_PORT=5432",
    "",
    "JWT_SECRET=7f2c1b9e4a8d3f6c0e5b2a9d1f8c7e4b3a6d9f2c1b8e5a3d7f0c4b2e9a1d6c",
    "",
    "ADMIN_NOME=Administrador ($PilotName)",
    "ADMIN_EMAIL=$AdminEmail",
    "ADMIN_SENHA=$AdminSenha",
    "",
    "OPERADOR_NOME=Operador Financeiro ($PilotName)",
    "OPERADOR_EMAIL=$OperadorEmail",
    "OPERADOR_SENHA=$OperadorSenha",
    "",
    "NODE_ENV=production",
    "CORS_ORIGIN=*"
)
$envFilePath = Join-Path $stagingDir ".env"
[System.IO.File]::WriteAllLines($envFilePath, $envLines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[3/5] Copiando packages/core..." -ForegroundColor Yellow
$coreDest = Join-Path $stagingDir "packages\core"
New-Item -ItemType Directory -Path $coreDest -Force | Out-Null
Copy-Item -Path (Join-Path $rootDir "packages\core\package.json") -Destination $coreDest
Copy-Item -Path (Join-Path $rootDir "packages\core\tsconfig.json") -Destination $coreDest
Copy-Item -Path (Join-Path $rootDir "packages\core\src") -Destination $coreDest -Recurse

Write-Host "[4/5] Copiando apps/api e apps/web..." -ForegroundColor Yellow

# API
$apiDest = Join-Path $stagingDir "apps\api"
New-Item -ItemType Directory -Path $apiDest -Force | Out-Null
Copy-Item -Path (Join-Path $rootDir "apps\api\Dockerfile") -Destination $apiDest
Copy-Item -Path (Join-Path $rootDir "apps\api\entrypoint.sh") -Destination $apiDest
Copy-Item -Path (Join-Path $rootDir "apps\api\package.json") -Destination $apiDest
Copy-Item -Path (Join-Path $rootDir "apps\api\tsconfig.json") -Destination $apiDest
Copy-Item -Path (Join-Path $rootDir "apps\api\prisma") -Destination $apiDest -Recurse
Copy-Item -Path (Join-Path $rootDir "apps\api\src") -Destination $apiDest -Recurse

# Web
$webDest = Join-Path $stagingDir "apps\web"
New-Item -ItemType Directory -Path $webDest -Force | Out-Null
Copy-Item -Path (Join-Path $rootDir "apps\web\Dockerfile") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\nginx.conf") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\package.json") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\tsconfig.json") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\tsconfig.app.json") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\tsconfig.node.json") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\vite.config.ts") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\index.html") -Destination $webDest
Copy-Item -Path (Join-Path $rootDir "apps\web\src") -Destination $webDest -Recurse
if (Test-Path (Join-Path $rootDir "apps\web\public")) {
    Copy-Item -Path (Join-Path $rootDir "apps\web\public") -Destination $webDest -Recurse
}

# Normalizacao LF para scripts Linux
$shFiles = @(
    (Join-Path $stagingDir "apps\api\entrypoint.sh"),
    (Join-Path $stagingDir "start-stack.sh")
)
foreach ($sh in $shFiles) {
    if (Test-Path $sh) {
        $text = [System.IO.File]::ReadAllText($sh)
        $cleanText = $text -replace "`r`n", "`n"
        [System.IO.File]::WriteAllText($sh, $cleanText, (New-Object System.Text.UTF8Encoding($false)))
    }
}

Write-Host "[5/5] Compactando para $OutputFile..." -ForegroundColor Yellow
Add-Type -AssemblyName "System.IO.Compression.FileSystem"
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Limpeza
Remove-Item -Recurse -Force $stagingDir

$fileSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " Pacote ZIP gerado com sucesso!" -ForegroundColor Green
Write-Host "  Arquivo: $zipPath" -ForegroundColor White
Write-Host "  Tamanho: $fileSizeMB MB" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "COMO ENVIAR AO PORTAINER / SERVIDOR:" -ForegroundColor Yellow
Write-Host "1. Envie '$OutputFile' para o servidor." -ForegroundColor White
Write-Host "2. No servidor, descompacte:" -ForegroundColor White
Write-Host "   unzip $OutputFile -d themisflow" -ForegroundColor Cyan
Write-Host "   cd themisflow" -ForegroundColor Cyan
Write-Host "3. Inicie a stack (aplica migrations e seed na 1a execucao):" -ForegroundColor White
Write-Host "   chmod +x start-stack.sh ; ./start-stack.sh" -ForegroundColor Cyan
Write-Host "4. Credenciais iniciais:" -ForegroundColor White
Write-Host "   - Admin:    $AdminEmail (Senha: $AdminSenha)" -ForegroundColor Green
Write-Host "   - Operador: $OperadorEmail (Senha: $OperadorSenha)" -ForegroundColor Green
Write-Host ""

# 🔍 Script de Auditoría de Seguridad (Windows PowerShell)
# Verifica que no hay información sensible en el código

Write-Host "🔍 AUDITORÍA DE SEGURIDAD - GammaExplorerPro" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

$ISSUES_FOUND = 0

Write-Host "📋 Escaneando por información sensible..." -ForegroundColor Yellow
Write-Host ""

# 1. Buscar API keys Stripe hardcodeadas
Write-Host -NoNewline "Buscando API keys Stripe... "
$results = Get-ChildItem -Path "src" -Recurse -Include "*.ts", "*.tsx" | Select-String -Pattern "sk_live_|sk_test_|pk_live_|pk_test_" -ErrorAction SilentlyContinue
if ($results) {
    Write-Host "❌ ENCONTRADO: API keys Stripe hardcodeadas" -ForegroundColor Red
    $results | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Red }
    $ISSUES_FOUND++
} else {
    Write-Host "✅ OK" -ForegroundColor Green
}

# 2. Buscar contraseñas hardcodeadas
Write-Host -NoNewline "Buscando contraseñas hardcodeadas... "
$results = Get-ChildItem -Path "src" -Recurse -Include "*.ts", "*.tsx" | Select-String -Pattern "password\s*[:=]" -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch "input|placeholder|label|type=" }
if ($results) {
    Write-Host "❌ ENCONTRADO: Posibles contraseñas" -ForegroundColor Red
    $results | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Red } | Select-Object -First 5
    $ISSUES_FOUND++
} else {
    Write-Host "✅ OK" -ForegroundColor Green
}

# 3. Buscar process.env. (no funciona en frontend)
Write-Host -NoNewline "Buscando process.env. (frontend)... "
$results = Get-ChildItem -Path "src" -Recurse -Include "*.ts", "*.tsx" | Select-String -Pattern "process\.env\." -ErrorAction SilentlyContinue
if ($results) {
    Write-Host "⚠️  ADVERTENCIA: process.env. no funciona en frontend" -ForegroundColor Yellow
    $results | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Yellow } | Select-Object -First 5
    $ISSUES_FOUND++
} else {
    Write-Host "✅ OK" -ForegroundColor Green
}

# 4. Verificar si .env está en git
Write-Host -NoNewline "Verificando .env en git history... "
try {
    $gitFiles = git ls-files 2>$null | Select-String -Pattern "\.env(\.|$)"
    if ($gitFiles) {
        Write-Host "❌ PELIGRO: .env está en git!" -ForegroundColor Red
        $gitFiles | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Red }
        $ISSUES_FOUND++
    } else {
        Write-Host "✅ OK" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Git no disponible" -ForegroundColor Yellow
}

# 5. Buscar archivos de credenciales
Write-Host -NoNewline "Buscando archivos de credenciales... "
$credFiles = Get-ChildItem -Path "." -Recurse -ErrorAction SilentlyContinue | Where-Object { 
    $_.Name -match "secret|credential|password" -and 
    $_.FullPath -notmatch "node_modules|\.git" 
}
if ($credFiles) {
    Write-Host "⚠️  ADVERTENCIA: Archivo sospechoso encontrado" -ForegroundColor Yellow
    $credFiles | ForEach-Object { Write-Host "  └─ $($_.FullName)" -ForegroundColor Yellow }
    $ISSUES_FOUND++
} else {
    Write-Host "✅ OK" -ForegroundColor Green
}

# 6. Verificar source maps en dist
Write-Host -NoNewline "Verificando source maps en build... "
if (Test-Path "dist") {
    $mapFiles = Get-ChildItem -Path "dist" -Recurse -Filter "*.map" -ErrorAction SilentlyContinue
    if ($mapFiles) {
        Write-Host "⚠️  ADVERTENCIA: Source maps en dist/" -ForegroundColor Yellow
        $mapFiles | ForEach-Object { Write-Host "  └─ $($_.FullName)" -ForegroundColor Yellow } | Select-Object -First 5
        $ISSUES_FOUND++
    } else {
        Write-Host "✅ OK" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  dist/ no existe" -ForegroundColor Yellow
}

# 7. Buscar URLs de backend hardcodeadas
Write-Host -NoNewline "Buscando URLs hardcodeadas... "
$results = Get-ChildItem -Path "src" -Recurse -Include "*.ts", "*.tsx" | Select-String -Pattern "http://localhost|127\.0\.0\.1|192\.168\." -ErrorAction SilentlyContinue
if ($results) {
    Write-Host "⚠️  ADVERTENCIA: URLs locales detectadas" -ForegroundColor Yellow
    $results | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Yellow } | Select-Object -First 5
    $ISSUES_FOUND++
} else {
    Write-Host "✅ OK" -ForegroundColor Green
}

# 8. Verificar console.log en build
Write-Host -NoNewline "Verificando console.log en build... "
if (Test-Path "dist") {
    $results = Get-ChildItem -Path "dist" -Recurse -Include "*.js" -ErrorAction SilentlyContinue | Select-String -Pattern "console\.(log|debug|info)" -ErrorAction SilentlyContinue
    if ($results) {
        Write-Host "⚠️  ADVERTENCIA: console.log en build" -ForegroundColor Yellow
        $results | ForEach-Object { Write-Host "  └─ $_" -ForegroundColor Yellow } | Select-Object -First 5
        $ISSUES_FOUND++
    } else {
        Write-Host "✅ OK" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  dist/ no existe" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan

if ($ISSUES_FOUND -eq 0) {
    Write-Host "✅ AUDITORÍA COMPLETADA: NO SE ENCONTRARON PROBLEMAS" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ AUDITORÍA COMPLETADA: $ISSUES_FOUND PROBLEMA(S) ENCONTRADO(S)" -ForegroundColor Red
    exit 1
}

#!/bin/bash
# 🔍 Script de Auditoría de Seguridad
# Verifica que no hay información sensible en el código

echo "🔍 AUDITORÍA DE SEGURIDAD - GammaExplorerPro"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ISSUES_FOUND=0

echo "📋 Escaneando por información sensible..."
echo ""

# 1. Buscar API keys hardcodeadas
echo -n "Buscando API keys hardcodeadas... "
if grep -r "sk_live_\|sk_test_\|pk_live_\|pk_test_" src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
    echo -e "${RED}❌ ENCONTRADO: API keys Stripe hardcodeadas${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 2. Buscar contraseñas
echo -n "Buscando contraseñas hardcodeadas... "
if grep -ri "password.*=" src/ --include="*.ts" --include="*.tsx" | grep -v "input\|placeholder\|label\|type=" 2>/dev/null; then
    echo -e "${RED}❌ ENCONTRADO: Posibles contraseñas${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 3. Buscar .env sin prefix VITE_
echo -n "Buscando variables de ambiente privadas... "
if grep -r "process\.env\." src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
    echo -e "${RED}⚠️  ADVERTENCIA: process.env. detectado (no funcionará en frontend)${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 4. Verificar .env en git
echo -n "Verificando archivos .env en git... "
if git ls-files 2>/dev/null | grep -E "\.env(\.|$)" 2>/dev/null; then
    echo -e "${RED}❌ PELIGRO: .env file está en git!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 5. Verificar archivos de credenciales
echo -n "Verificando archivos de credenciales... "
if find . -type f \( -name "*secret*" -o -name "*credential*" -o -name "*.key" \) 2>/dev/null | grep -v node_modules; then
    echo -e "${RED}❌ ENCONTRADO: Archivo de credenciales${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 6. Verificar source maps en producción
echo -n "Verificando source maps en build... "
if [ -d "dist" ] && find dist -name "*.map" 2>/dev/null | grep -q .; then
    echo -e "${YELLOW}⚠️  ADVERTENCIA: Source maps encontrados en dist/${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK (o dist no existe)${NC}"
fi

# 7. Buscar hardcoded URLs de Backend
echo -n "Buscando URLs de backend hardcodeadas... "
if grep -r "http://localhost\|127\.0\.0\.1\|192\.168\." src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v comment | head -5; then
    echo -e "${YELLOW}⚠️  ADVERTENCIA: URLs locales detectadas${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK${NC}"
fi

# 8. Verificar console.lo en build
echo -n "Verificando console.log en build... "
if [ -d "dist" ] && grep -r "console\.\(log\|debug\|info\)" dist/ --include="*.js" 2>/dev/null | head -5; then
    echo -e "${YELLOW}⚠️  ADVERTENCIA: console.log detectado en build${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ OK (o dist no existe)${NC}"
fi

echo ""
echo "=============================================="
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ Auditoría completada: NO se encontraron problemas${NC}"
    exit 0
else
    echo -e "${RED}❌ Auditoría completada: $ISSUES_FOUND PROBLEMA(S) ENCONTRADO(S)${NC}"
    exit 1
fi

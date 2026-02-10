#!/bin/bash

echo "=============================================="
echo "  🔍 VÉRIFICATION INTERFACE ADMIN SHAREAZURE"
echo "=============================================="
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Vérifier la structure des dossiers
echo "📁 Vérification de la structure..."
if [ -d "admin" ] && [ -d "frontend" ] && [ -d "backend" ]; then
    echo -e "${GREEN}✅ Structure correcte${NC}"
else
    echo -e "${RED}❌ Structure incorrecte${NC}"
    echo "Vérifiez que vous êtes à la racine du projet"
    exit 1
fi

echo ""
echo "📄 Vérification des fichiers essentiels..."

# Vérifier les fichiers
files=(
    "admin/index.html"
    "admin/js/admin.js"
    "admin/css/admin.css"
    "frontend/index.html"
    "frontend/app.js"
    "backend/server.js"
    "index.html"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✅${NC} $file"
    else
        echo -e "  ${RED}❌${NC} $file (manquant!)"
    fi
done

echo ""
echo "🔌 Vérification des serveurs..."

# Vérifier le backend
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Backend actif${NC} (http://localhost:3000)"
else
    echo -e "  ${YELLOW}⚠️  Backend non démarré${NC}"
    echo "     Démarrer avec: cd backend && npm start"
fi

# Vérifier le serveur web
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Serveur web actif${NC} (http://localhost:8080)"
else
    echo -e "  ${YELLOW}⚠️  Serveur web non démarré${NC}"
    echo "     Démarrer avec: python3 -m http.server 8080"
fi

echo ""
echo "🌐 URLs d'accès:"
echo -e "  🏠 Accueil:        ${GREEN}http://localhost:8080${NC}"
echo -e "  👤 Frontend:       ${GREEN}http://localhost:8080/frontend/${NC}"
echo -e "  🏛️  Admin:          ${GREEN}http://localhost:8080/admin/${NC}"
echo -e "  🔌 API:            ${GREEN}http://localhost:3000/api${NC}"

echo ""
echo "=============================================="
echo ""

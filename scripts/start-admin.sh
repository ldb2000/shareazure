#!/bin/bash

# Script de démarrage de ShareAzure avec Interface Admin
# Usage: ./scripts/start-admin.sh

echo "🚀 Démarrage de ShareAzure avec Interface Admin..."
echo ""

# Couleurs pour l'output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "backend/server.js" ]; then
    echo "❌ Erreur: Ce script doit être exécuté depuis la racine du projet ShareAzure"
    exit 1
fi

# Vérifier que Node.js est installé
if ! command -v node &> /dev/null; then
    echo "❌ Erreur: Node.js n'est pas installé"
    echo "Installer Node.js depuis: https://nodejs.org/"
    exit 1
fi

# Vérifier que les dépendances sont installées
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installation des dépendances du backend..."
    cd backend
    npm install
    cd ..
fi

# Vérifier le fichier .env
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Attention: Fichier .env non trouvé"
    echo "📝 Création d'un fichier .env depuis .env.example..."
    cp backend/.env.example backend/.env
    echo ""
    echo "${YELLOW}⚠️  IMPORTANT: Configurez votre connection string Azure dans backend/.env${NC}"
    echo ""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "${BLUE}📦 ShareAzure v2.0${NC}"
echo ""
echo "${GREEN}✅ Backend:${NC}  http://localhost:3000"
echo "${GREEN}✅ Frontend:${NC} http://localhost:8080/frontend/"
echo "${GREEN}✅ Admin:${NC}    http://localhost:8080/admin/"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Fonction pour nettoyer à la sortie
cleanup() {
    echo ""
    echo "🛑 Arrêt des serveurs..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Démarrer le backend
echo "🔵 Démarrage du backend..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# Attendre que le backend démarre
sleep 2

# Vérifier que le backend fonctionne
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "${GREEN}✅ Backend démarré avec succès${NC}"
else
    echo "${YELLOW}⚠️  Le backend met du temps à démarrer...${NC}"
fi

echo ""

# Démarrer le frontend
echo "🔵 Démarrage du serveur web (frontend + admin)..."

# Vérifier si Python 3 est disponible
if command -v python3 &> /dev/null; then
    # Servir depuis la racine pour avoir accès à /frontend et /admin
    python3 -m http.server 8080 &
    FRONTEND_PID=$!
    echo "${GREEN}✅ Serveur web démarré avec Python 3${NC}"
elif command -v python &> /dev/null; then
    python -m http.server 8080 &
    FRONTEND_PID=$!
    echo "${GREEN}✅ Serveur web démarré avec Python${NC}"
else
    echo "${YELLOW}⚠️  Python non trouvé, essai avec npx http-server...${NC}"
    if command -v npx &> /dev/null; then
        npx http-server -p 8080 &
        FRONTEND_PID=$!
        echo "${GREEN}✅ Serveur web démarré avec http-server${NC}"
    else
        echo "❌ Impossible de démarrer le serveur web"
        echo "Installer Python ou Node.js"
        kill $BACKEND_PID
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "${GREEN}🎉 ShareAzure est prêt !${NC}"
echo ""
echo "📱 Ouvrez dans votre navigateur :"
echo ""
echo "   👤 Interface utilisateur: ${BLUE}http://localhost:8080/frontend/${NC}"
echo "   🎛️  Interface admin:       ${BLUE}http://localhost:8080/admin/${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Conseils :"
echo "   • Uploadez des fichiers via l'interface utilisateur"
echo "   • Consultez les stats dans l'interface admin"
echo "   • Générez des liens de partage"
echo ""
echo "🛑 Pour arrêter : Appuyez sur Ctrl+C"
echo ""

# Attendre indéfiniment
wait

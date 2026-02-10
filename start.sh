#!/bin/bash

# Script de démarrage ShareAzure
# Ce script démarre automatiquement le backend et le frontend

echo "🚀 Démarrage de ShareAzure..."
echo ""

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier si le backend est en cours
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${RED}⚠️  Le port 3000 est déjà utilisé${NC}"
    echo "   Arrêtez d'abord le processus avec: lsof -ti:3000 | xargs kill -9"
    exit 1
fi

# Vérifier si le frontend est en cours
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${RED}⚠️  Le port 8080 est déjà utilisé${NC}"
    echo "   Arrêtez d'abord le processus avec: lsof -ti:8080 | xargs kill -9"
    exit 1
fi

# Démarrer le backend
echo -e "${BLUE}📦 Démarrage du backend...${NC}"
cd backend
npm start > /tmp/shareazure-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
cd ..

# Attendre que le backend démarre
sleep 3

# Vérifier que le backend est bien démarré
if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${RED}❌ Erreur: Le backend n'a pas démarré${NC}"
    echo "   Vérifiez les logs: tail -f /tmp/shareazure-backend.log"
    exit 1
fi

# Démarrer le frontend
echo -e "${BLUE}🌐 Démarrage du frontend...${NC}"
cd frontend
python3 -m http.server 8080 > /tmp/shareazure-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
cd ..

# Attendre que le frontend démarre
sleep 2

# Vérifier que le frontend est bien démarré
if ! lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${RED}❌ Erreur: Le frontend n'a pas démarré${NC}"
    echo "   Vérifiez les logs: tail -f /tmp/shareazure-frontend.log"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${GREEN}✅ ShareAzure est démarré !${NC}"
echo ""
echo "📍 URLs:"
echo "   Frontend:  http://localhost:8080"
echo "   Admin:     http://localhost:8080/admin/"
echo "   Backend:   http://localhost:3000"
echo "   Health:    http://localhost:3000/api/health"
echo ""
echo "📋 Logs:"
echo "   Backend:   tail -f /tmp/shareazure-backend.log"
echo "   Frontend:  tail -f /tmp/shareazure-frontend.log"
echo ""
echo "🛑 Pour arrêter:"
echo "   ./stop.sh"
echo ""

# Sauvegarder les PIDs
echo "$BACKEND_PID" > /tmp/shareazure-backend.pid
echo "$FRONTEND_PID" > /tmp/shareazure-frontend.pid

# Ouvrir le navigateur (optionnel, commenté par défaut)
# sleep 1
# open http://localhost:8080/login.html

echo "Appuyez sur Ctrl+C pour voir les logs en direct, ou fermez ce terminal."
echo ""

# Suivre les logs
tail -f /tmp/shareazure-backend.log

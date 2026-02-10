#!/bin/bash

# Script d'arrêt ShareAzure

echo "🛑 Arrêt de ShareAzure..."
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Arrêter via les PIDs sauvegardés
if [ -f /tmp/shareazure-backend.pid ]; then
    BACKEND_PID=$(cat /tmp/shareazure-backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✓${NC} Backend arrêté (PID: $BACKEND_PID)"
    fi
    rm /tmp/shareazure-backend.pid
fi

if [ -f /tmp/shareazure-frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/shareazure-frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✓${NC} Frontend arrêté (PID: $FRONTEND_PID)"
    fi
    rm /tmp/shareazure-frontend.pid
fi

# Forcer l'arrêt des processus sur les ports si nécessaire
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "🔨 Arrêt forcé du processus sur le port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
fi

if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "🔨 Arrêt forcé du processus sur le port 8080..."
    lsof -ti:8080 | xargs kill -9 2>/dev/null
fi

# Nettoyer les logs (optionnel)
# rm -f /tmp/shareazure-backend.log /tmp/shareazure-frontend.log

echo ""
echo -e "${GREEN}✅ ShareAzure arrêté${NC}"

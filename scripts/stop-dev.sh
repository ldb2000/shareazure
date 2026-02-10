#!/bin/bash

# Script pour arrêter ShareAzure
# Usage: ./scripts/stop-dev.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Arrêt de ShareAzure...${NC}\n"

# Lire les PIDs sauvegardés
if [ -f ".pids" ]; then
    read BACKEND_PID FRONTEND_PID < .pids
    
    # Arrêter le backend
    if [ ! -z "$BACKEND_PID" ]; then
        if kill $BACKEND_PID 2>/dev/null; then
            echo -e "${GREEN}✅ Backend arrêté (PID: $BACKEND_PID)${NC}"
        fi
    fi
    
    # Arrêter le frontend
    if [ ! -z "$FRONTEND_PID" ]; then
        if kill $FRONTEND_PID 2>/dev/null; then
            echo -e "${GREEN}✅ Frontend arrêté (PID: $FRONTEND_PID)${NC}"
        fi
    fi
    
    rm .pids
else
    # Fallback: tuer par port
    echo -e "${YELLOW}Recherche des processus par port...${NC}"
    
    # Port 3000 (backend)
    BACKEND_PID=$(lsof -ti:3000 2>/dev/null)
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Backend arrêté (port 3000)${NC}"
    fi
    
    # Port 8080 (frontend)
    FRONTEND_PID=$(lsof -ti:8080 2>/dev/null)
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Frontend arrêté (port 8080)${NC}"
    fi
fi

echo -e "\n${GREEN}ShareAzure arrêté avec succès${NC}\n"

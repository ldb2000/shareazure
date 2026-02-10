#!/bin/bash

# Script de démarrage en mode développement
# Usage: ./scripts/start-dev.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 Démarrage de ShareAzure (Dev)${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Vérifier Node.js
echo -e "${YELLOW}📦 Vérification de Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    echo -e "${YELLOW}Installez Node.js depuis https://nodejs.org${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}\n"

# Vérifier le fichier .env
echo -e "${YELLOW}🔑 Vérification de la configuration...${NC}"
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ Fichier backend/.env manquant${NC}"
    echo -e "${YELLOW}Créez-le à partir de backend/.env.example${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Fichier .env trouvé${NC}\n"

# Installer les dépendances backend si nécessaire
if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}📥 Installation des dépendances backend...${NC}"
    cd backend
    npm install
    cd ..
    echo -e "${GREEN}✅ Dépendances installées${NC}\n"
fi

# Tester la connexion Azure
echo -e "${YELLOW}🔍 Test de connexion Azure...${NC}"
cd backend
node test-connection.js
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erreur de connexion Azure${NC}"
    echo -e "${YELLOW}Vérifiez votre configuration dans .env${NC}"
    exit 1
fi
cd ..

# Démarrer le backend en arrière-plan
echo -e "\n${YELLOW}🔧 Démarrage du backend...${NC}"
cd backend
npm start &
BACKEND_PID=$!
cd ..
echo -e "${GREEN}✅ Backend démarré (PID: $BACKEND_PID)${NC}"
echo -e "${BLUE}   URL: http://localhost:3000${NC}\n"

# Attendre que le backend soit prêt
echo -e "${YELLOW}⏳ Attente du backend...${NC}"
sleep 3

# Vérifier que le backend répond
for i in {1..10}; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend prêt${NC}\n"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Le backend ne répond pas${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Créer le conteneur Azure si nécessaire
echo -e "${YELLOW}📦 Initialisation du conteneur Azure...${NC}"
curl -s -X POST http://localhost:3000/api/container/init > /dev/null 2>&1
echo -e "${GREEN}✅ Conteneur prêt${NC}\n"

# Démarrer le frontend
echo -e "${YELLOW}🌐 Démarrage du frontend...${NC}"
cd frontend

# Choisir le serveur HTTP disponible
if command -v python3 &> /dev/null; then
    echo -e "${BLUE}   Utilisation de Python HTTP server${NC}"
    python3 -m http.server 8080 &
    FRONTEND_PID=$!
elif command -v npx &> /dev/null; then
    echo -e "${BLUE}   Utilisation de http-server${NC}"
    npx http-server -p 8080 &
    FRONTEND_PID=$!
else
    echo -e "${RED}❌ Aucun serveur HTTP disponible${NC}"
    echo -e "${YELLOW}Installez Python 3 ou Node.js${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

cd ..
echo -e "${GREEN}✅ Frontend démarré (PID: $FRONTEND_PID)${NC}"
echo -e "${BLUE}   URL: http://localhost:8080${NC}\n"

# Attendre que le frontend soit prêt
sleep 2

# Résumé
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ ShareAzure est prêt !${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Frontend:${NC} http://localhost:8080"
echo -e "${BLUE}Backend:${NC}  http://localhost:3000"
echo -e "${BLUE}API Docs:${NC} http://localhost:3000/api/health"
echo -e ""
echo -e "${YELLOW}Pour arrêter l'application:${NC}"
echo -e "  kill $BACKEND_PID $FRONTEND_PID"
echo -e "  ${BLUE}ou utilisez:${NC} ./scripts/stop-dev.sh"
echo -e ""
echo -e "${GREEN}Ouvrez votre navigateur sur http://localhost:8080${NC}\n"

# Sauvegarder les PIDs
echo "$BACKEND_PID $FRONTEND_PID" > .pids

# Garder le script en vie
wait

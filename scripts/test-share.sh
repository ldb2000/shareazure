#!/bin/bash

# Script de test de la fonctionnalité de partage
# ShareAzure v1.2.0

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ShareAzure - Test de Partage v1.2.0       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

API_URL="http://localhost:3000/api"

# Fonction pour tester si le serveur est en ligne
test_server() {
    echo -e "${YELLOW}🔍 Vérification du serveur...${NC}"
    
    if curl -s "${API_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Serveur backend opérationnel${NC}"
        return 0
    else
        echo -e "${RED}❌ Serveur backend non accessible${NC}"
        echo -e "${YELLOW}💡 Démarrez le serveur avec:${NC}"
        echo -e "   cd backend && npm start"
        return 1
    fi
}

# Fonction pour lister les fichiers
list_files() {
    echo ""
    echo -e "${YELLOW}📁 Liste des fichiers disponibles:${NC}"
    
    RESPONSE=$(curl -s "${API_URL}/files")
    
    if command -v jq &> /dev/null; then
        echo "$RESPONSE" | jq -r '.files[] | "  - \(.metadata.originalName // .name) [\(.name)]"'
    else
        echo "$RESPONSE"
        echo ""
        echo -e "${YELLOW}💡 Installez 'jq' pour un meilleur affichage:${NC}"
        echo "   brew install jq  # macOS"
        echo "   sudo apt install jq  # Ubuntu/Debian"
    fi
}

# Fonction pour générer un lien de partage
generate_share_link() {
    local BLOB_NAME=$1
    local EXPIRES_IN=$2
    
    echo ""
    echo -e "${YELLOW}🔗 Génération d'un lien de partage...${NC}"
    echo -e "   Fichier: ${BLOB_NAME}"
    echo -e "   Durée: ${EXPIRES_IN} minutes"
    
    RESPONSE=$(curl -s -X POST "${API_URL}/share/generate" \
        -H "Content-Type: application/json" \
        -d "{\"blobName\":\"${BLOB_NAME}\",\"expiresInMinutes\":${EXPIRES_IN}}")
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Lien généré avec succès${NC}"
        
        if command -v jq &> /dev/null; then
            SHARE_LINK=$(echo "$RESPONSE" | jq -r '.shareLink')
            EXPIRES_AT=$(echo "$RESPONSE" | jq -r '.expiresAt')
            
            echo ""
            echo -e "${GREEN}📋 Lien de partage:${NC}"
            echo "${SHARE_LINK}"
            echo ""
            echo -e "${GREEN}🕒 Expire le:${NC} ${EXPIRES_AT}"
            echo ""
            echo -e "${YELLOW}💡 Testez le lien:${NC}"
            echo "   curl -I \"${SHARE_LINK}\""
        else
            echo "$RESPONSE"
        fi
    else
        echo -e "${RED}❌ Erreur lors de la génération${NC}"
        echo "$RESPONSE"
        return 1
    fi
}

# Fonction pour tester un lien
test_link() {
    local LINK=$1
    
    echo ""
    echo -e "${YELLOW}🧪 Test du lien de partage...${NC}"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -I "$LINK")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Lien valide et accessible (HTTP $HTTP_CODE)${NC}"
        return 0
    else
        echo -e "${RED}❌ Lien inaccessible (HTTP $HTTP_CODE)${NC}"
        return 1
    fi
}

# Menu principal
show_menu() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║              Menu de Test                    ║${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║  1. Vérifier le serveur                      ║${NC}"
    echo -e "${BLUE}║  2. Lister les fichiers                      ║${NC}"
    echo -e "${BLUE}║  3. Générer un lien de partage               ║${NC}"
    echo -e "${BLUE}║  4. Tester un lien existant                  ║${NC}"
    echo -e "${BLUE}║  5. Test complet automatique                 ║${NC}"
    echo -e "${BLUE}║  q. Quitter                                  ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

# Test automatique complet
run_full_test() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           Test Automatique Complet           ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
    
    # 1. Test serveur
    if ! test_server; then
        return 1
    fi
    
    sleep 1
    
    # 2. Liste des fichiers
    list_files
    
    echo ""
    echo -e "${YELLOW}📥 Pour tester la génération de lien:${NC}"
    echo -e "   1. Uploadez un fichier via l'interface web"
    echo -e "   2. Copiez son blobName depuis la liste ci-dessus"
    echo -e "   3. Utilisez l'option 3 du menu"
    
    echo ""
    echo -e "${GREEN}✅ Tests de base terminés${NC}"
}

# Boucle principale
if [ "$1" = "--auto" ]; then
    run_full_test
    exit 0
fi

while true; do
    show_menu
    read -p "Votre choix: " choice
    
    case $choice in
        1)
            test_server
            ;;
        2)
            list_files
            ;;
        3)
            echo ""
            read -p "BlobName du fichier: " blob_name
            read -p "Durée en minutes (défaut: 60): " expires_in
            expires_in=${expires_in:-60}
            generate_share_link "$blob_name" "$expires_in"
            ;;
        4)
            echo ""
            read -p "Lien à tester: " link
            test_link "$link"
            ;;
        5)
            run_full_test
            ;;
        q|Q)
            echo ""
            echo -e "${GREEN}👋 Au revoir !${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Option invalide${NC}"
            ;;
    esac
    
    echo ""
    read -p "Appuyez sur Entrée pour continuer..."
done

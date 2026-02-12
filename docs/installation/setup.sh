#!/bin/bash
# ======================================================
# ShareAzure — Script d'installation rapide
# ======================================================
# Usage: ./setup.sh [--skip-terraform]
#
# Ce script :
#   1. Verifie les pre-requis (node, npm, terraform, ffmpeg)
#   2. Deploie l'infrastructure Azure via Terraform (si demande)
#   3. Configure le fichier .env a partir des outputs Terraform
#   4. Installe les dependances npm
#   5. Teste la connexion Azure
#   6. Propose de lancer l'application
# ======================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
INFRA_DIR="$PROJECT_ROOT/infrastructure"

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  ShareAzure — Installation${NC}"
echo -e "${BLUE}======================================================${NC}"
echo ""

# ============================================
# 1. Verification des pre-requis
# ============================================
echo -e "${YELLOW}[1/6] Verification des pre-requis...${NC}"

check_cmd() {
    if command -v "$1" &> /dev/null; then
        local version=$($1 --version 2>/dev/null | head -1)
        echo -e "  ${GREEN}✓${NC} $1 — $version"
        return 0
    else
        echo -e "  ${RED}✗${NC} $1 — non trouve"
        return 1
    fi
}

MISSING=0

check_cmd "node" || MISSING=1
check_cmd "npm" || MISSING=1
check_cmd "terraform" || { echo -e "  ${YELLOW}⚠${NC}  terraform non trouve (necessaire uniquement pour l'infra Azure)"; }
check_cmd "ffmpeg" || { echo -e "  ${YELLOW}⚠${NC}  ffmpeg non trouve (necessaire uniquement pour l'analyse video/audio IA)"; }
check_cmd "az" || { echo -e "  ${YELLOW}⚠${NC}  Azure CLI non trouve (necessaire uniquement pour l'infra Azure)"; }

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}❌ Node.js et npm sont obligatoires. Installez-les depuis https://nodejs.org${NC}"
    exit 1
fi

echo ""

# ============================================
# 2. Terraform (optionnel)
# ============================================
SKIP_TERRAFORM=false
if [[ "$1" == "--skip-terraform" ]]; then
    SKIP_TERRAFORM=true
fi

if [ "$SKIP_TERRAFORM" = false ] && command -v terraform &> /dev/null && command -v az &> /dev/null; then
    echo -e "${YELLOW}[2/6] Infrastructure Azure (Terraform)${NC}"
    echo ""
    read -p "Voulez-vous deployer/mettre a jour l'infrastructure Azure ? (o/N) " DEPLOY_INFRA

    if [[ "$DEPLOY_INFRA" =~ ^[oOyY]$ ]]; then
        # Verifier que terraform.tfvars existe
        if [ ! -f "$INFRA_DIR/terraform.tfvars" ]; then
            echo -e "  ${YELLOW}⚠${NC}  terraform.tfvars n'existe pas"
            echo "  Copie de terraform.tfvars.example..."
            cp "$INFRA_DIR/terraform.tfvars.example" "$INFRA_DIR/terraform.tfvars"
            echo ""
            echo -e "  ${YELLOW}→ Editez infrastructure/terraform.tfvars avec vos valeurs,${NC}"
            echo -e "  ${YELLOW}  puis relancez ce script.${NC}"
            echo ""
            echo "  Valeurs obligatoires a modifier :"
            echo "    - resource_group_name  (nom de votre Resource Group Azure)"
            echo "    - storage_account_name (nom unique, minuscules+chiffres, 3-24 chars)"
            echo ""
            exit 0
        fi

        echo "  Initialisation de Terraform..."
        cd "$INFRA_DIR"
        terraform init -input=false

        echo ""
        echo "  Previsualisation des changements..."
        terraform plan -input=false

        echo ""
        read -p "  Appliquer ces changements ? (o/N) " APPLY
        if [[ "$APPLY" =~ ^[oOyY]$ ]]; then
            terraform apply -input=false -auto-approve
            echo ""
            echo -e "  ${GREEN}✓ Infrastructure deployee${NC}"
        else
            echo -e "  ${YELLOW}⚠ Deploiement annule${NC}"
        fi
        cd "$PROJECT_ROOT"
    fi
else
    echo -e "${YELLOW}[2/6] Terraform — ignore${NC}"
fi

echo ""

# ============================================
# 3. Configuration .env
# ============================================
echo -e "${YELLOW}[3/6] Configuration du backend (.env)${NC}"

if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo -e "  ${GREEN}✓${NC} .env cree a partir de .env.example"

    # Si Terraform est disponible, proposer de remplir automatiquement
    if command -v terraform &> /dev/null && [ -f "$INFRA_DIR/terraform.tfstate" ]; then
        echo ""
        read -p "  Remplir .env automatiquement depuis les outputs Terraform ? (o/N) " AUTO_ENV

        if [[ "$AUTO_ENV" =~ ^[oOyY]$ ]]; then
            cd "$INFRA_DIR"

            # Storage connection string
            CONN_STRING=$(terraform output -raw storage_account_primary_connection_string 2>/dev/null || echo "")
            if [ -n "$CONN_STRING" ]; then
                sed -i.bak "s|AZURE_STORAGE_CONNECTION_STRING=.*|AZURE_STORAGE_CONNECTION_STRING=$CONN_STRING|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} AZURE_STORAGE_CONNECTION_STRING configure"
            fi

            # Storage account name
            ACCOUNT_NAME=$(terraform output -raw storage_account_name 2>/dev/null || echo "")
            if [ -n "$ACCOUNT_NAME" ]; then
                sed -i.bak "s|AZURE_STORAGE_ACCOUNT_NAME=.*|AZURE_STORAGE_ACCOUNT_NAME=$ACCOUNT_NAME|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} AZURE_STORAGE_ACCOUNT_NAME configure"
            fi

            # Storage account key
            ACCOUNT_KEY=$(terraform output -raw storage_account_primary_access_key 2>/dev/null || echo "")
            if [ -n "$ACCOUNT_KEY" ]; then
                sed -i.bak "s|AZURE_STORAGE_ACCOUNT_KEY=.*|AZURE_STORAGE_ACCOUNT_KEY=$ACCOUNT_KEY|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} AZURE_STORAGE_ACCOUNT_KEY configure"
            fi

            # Cognitive Services endpoint
            VISION_ENDPOINT=$(terraform output -raw cognitive_services_endpoint 2>/dev/null || echo "")
            if [ -n "$VISION_ENDPOINT" ] && [ "$VISION_ENDPOINT" != "" ]; then
                sed -i.bak "s|# AZURE_VISION_ENDPOINT=.*|AZURE_VISION_ENDPOINT=$VISION_ENDPOINT|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} AZURE_VISION_ENDPOINT configure"
            fi

            # Cognitive Services key
            VISION_KEY=$(terraform output -raw cognitive_services_key 2>/dev/null || echo "")
            if [ -n "$VISION_KEY" ] && [ "$VISION_KEY" != "" ]; then
                sed -i.bak "s|# AZURE_VISION_KEY=.*|AZURE_VISION_KEY=$VISION_KEY|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} AZURE_VISION_KEY configure"
            fi

            # App Insights
            APP_INSIGHTS=$(terraform output -raw application_insights_connection_string 2>/dev/null || echo "")
            if [ -n "$APP_INSIGHTS" ] && [ "$APP_INSIGHTS" != "" ]; then
                sed -i.bak "s|# APPLICATIONINSIGHTS_CONNECTION_STRING=.*|APPLICATIONINSIGHTS_CONNECTION_STRING=$APP_INSIGHTS|" "$BACKEND_DIR/.env"
                echo -e "  ${GREEN}✓${NC} APPLICATIONINSIGHTS_CONNECTION_STRING configure"
            fi

            # Cleanup backup files
            rm -f "$BACKEND_DIR/.env.bak"

            cd "$PROJECT_ROOT"
            echo ""
            echo -e "  ${GREEN}✓ .env configure automatiquement depuis Terraform${NC}"
        fi
    fi

    echo ""
    echo -e "  ${YELLOW}→ Editez backend/.env pour completer la configuration${NC}"
    echo "    (cles OpenAI, email SMTP, etc.)"
else
    echo -e "  ${GREEN}✓${NC} .env existe deja"
fi

echo ""

# ============================================
# 4. Installation des dependances
# ============================================
echo -e "${YELLOW}[4/6] Installation des dependances npm...${NC}"

cd "$BACKEND_DIR"
npm install --silent 2>/dev/null
echo -e "  ${GREEN}✓${NC} Dependances installees"

cd "$PROJECT_ROOT"
echo ""

# ============================================
# 5. Test de connexion Azure
# ============================================
echo -e "${YELLOW}[5/6] Test de connexion Azure...${NC}"

cd "$BACKEND_DIR"

# Verifier que la connection string est configuree
if grep -q "votre_compte" .env 2>/dev/null || grep -q "votre_cle" .env 2>/dev/null; then
    echo -e "  ${YELLOW}⚠${NC}  La connection string n'est pas encore configuree dans .env"
    echo "     Editez backend/.env avec vos valeurs Azure avant de tester"
else
    if node test-connection.js 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Connexion Azure OK"
    else
        echo -e "  ${RED}✗${NC} Echec de la connexion Azure"
        echo "     Verifiez AZURE_STORAGE_CONNECTION_STRING dans backend/.env"
    fi
fi

cd "$PROJECT_ROOT"
echo ""

# ============================================
# 6. Lancement
# ============================================
echo -e "${YELLOW}[6/6] Lancement${NC}"
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  Installation terminee !${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo "  Pour lancer l'application :"
echo ""
echo "    # Option 1 : script automatique"
echo "    ./scripts/start-dev.sh"
echo ""
echo "    # Option 2 : manuellement"
echo "    cd backend && npm run dev     # Terminal 1"
echo "    cd frontend && python3 -m http.server 8080  # Terminal 2"
echo ""
echo "  Interfaces :"
echo "    Frontend : http://localhost:8080"
echo "    Admin    : http://localhost:8080/admin/"
echo "    API      : http://localhost:3000/api/health"
echo ""

read -p "Lancer l'application maintenant ? (o/N) " LAUNCH

if [[ "$LAUNCH" =~ ^[oOyY]$ ]]; then
    if [ -f "$PROJECT_ROOT/scripts/start-dev.sh" ]; then
        exec "$PROJECT_ROOT/scripts/start-dev.sh"
    else
        echo "cd backend && npm run dev"
        cd "$BACKEND_DIR" && npm run dev
    fi
fi

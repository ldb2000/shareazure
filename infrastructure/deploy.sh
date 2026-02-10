#!/bin/bash

# Script de déploiement de l'infrastructure ShareAzure
# Ce script guide l'utilisateur à travers le processus de déploiement

set -e

echo "🚀 Déploiement de l'infrastructure ShareAzure"
echo "=============================================="
echo ""

# Vérifier que Terraform est installé
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform n'est pas installé. Installez-le depuis https://www.terraform.io/downloads"
    exit 1
fi

# Vérifier que Azure CLI est installé
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI n'est pas installé. Installez-le depuis https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

echo "✅ Terraform et Azure CLI sont installés"
echo ""

# Vérifier la connexion Azure
echo "📡 Vérification de la connexion Azure..."
if ! az account show &> /dev/null; then
    echo "⚠️  Vous n'êtes pas connecté à Azure. Connexion en cours..."
    az login
fi

# Définir la subscription
SUBSCRIPTION_ID="011ab966-2d51-4b9b-a5f2-397425614082"
echo "📋 Configuration de la subscription Azure..."
az account set --subscription "$SUBSCRIPTION_ID"

# Vérifier le resource group
echo "🔍 Vérification du resource group..."
if ! az group show --name rg-shareazure &> /dev/null; then
    echo "❌ Le resource group 'rg-shareazure' n'existe pas."
    echo "   Créez-le avec : az group create --name rg-shareazure --location francecentral"
    exit 1
fi
echo "✅ Resource group 'rg-shareazure' trouvé"

# Vérifier le provider Storage
echo "🔍 Vérification du provider Microsoft.Storage..."
STORAGE_STATE=$(az provider show --namespace Microsoft.Storage --query "registrationState" -o tsv)

if [ "$STORAGE_STATE" != "Registered" ]; then
    echo "⚠️  Le provider Microsoft.Storage n'est pas enregistré (état: $STORAGE_STATE)"
    echo "   Enregistrement en cours..."
    az provider register --namespace Microsoft.Storage
    
    echo "   Attente de l'enregistrement (peut prendre 1-2 minutes)..."
    while [ "$(az provider show --namespace Microsoft.Storage --query 'registrationState' -o tsv)" != "Registered" ]; do
        echo -n "."
        sleep 5
    done
    echo ""
    echo "✅ Provider Microsoft.Storage enregistré"
else
    echo "✅ Provider Microsoft.Storage déjà enregistré"
fi

echo ""
echo "🔧 Initialisation de Terraform..."
terraform init

echo ""
echo "📝 Vérification de la configuration..."
terraform validate
echo "✅ Configuration valide"

echo ""
echo "📊 Plan d'exécution Terraform..."
terraform plan

echo ""
read -p "🚀 Voulez-vous appliquer ces changements ? (yes/no) : " confirm

if [ "$confirm" = "yes" ]; then
    echo ""
    echo "⚙️  Déploiement en cours..."
    terraform apply
    
    echo ""
    echo "✅ Déploiement terminé !"
    echo ""
    echo "📋 Informations de connexion :"
    echo "================================"
    terraform output
    
    echo ""
    echo "💡 Pour récupérer la connection string :"
    echo "   terraform output -raw storage_account_primary_connection_string"
else
    echo "❌ Déploiement annulé"
    exit 0
fi

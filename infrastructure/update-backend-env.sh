#!/bin/bash

# Script pour mettre à jour le fichier .env du backend avec les credentials Terraform
# Usage: ./update-backend-env.sh

set -e

echo "🔄 Mise à jour du fichier .env du backend..."
echo ""

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "main.tf" ]; then
    echo "❌ Erreur: Ce script doit être exécuté depuis le répertoire infrastructure/"
    exit 1
fi

# Vérifier que Terraform est initialisé
if [ ! -d ".terraform" ]; then
    echo "❌ Erreur: Terraform n'est pas initialisé. Exécutez 'terraform init' d'abord."
    exit 1
fi

# Récupérer les outputs Terraform
echo "📥 Récupération des credentials depuis Terraform..."

STORAGE_ACCOUNT_NAME=$(terraform output -raw storage_account_name)
STORAGE_ACCOUNT_KEY=$(terraform output -raw storage_account_primary_access_key)
STORAGE_CONNECTION_STRING=$(terraform output -raw storage_account_primary_connection_string)
CONTAINER_NAME=$(terraform output -raw container_name)
APP_INSIGHTS_CONNECTION_STRING=$(terraform output -raw application_insights_connection_string)

# Créer le fichier .env
BACKEND_DIR="../backend"
ENV_FILE="$BACKEND_DIR/.env"

echo "📝 Création du fichier $ENV_FILE..."

cat > "$ENV_FILE" << EOF
# Configuration Azure Storage - Généré automatiquement par Terraform
# Date: $(date)

AZURE_STORAGE_ACCOUNT_NAME=$STORAGE_ACCOUNT_NAME
AZURE_STORAGE_ACCOUNT_KEY=$STORAGE_ACCOUNT_KEY
AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONNECTION_STRING

# Configuration du conteneur
AZURE_CONTAINER_NAME=$CONTAINER_NAME

# Configuration serveur
PORT=3000
NODE_ENV=development

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=$APP_INSIGHTS_CONNECTION_STRING

# CORS
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000

# Limites d'upload
MAX_FILE_SIZE_MB=100
EOF

echo "✅ Fichier .env créé avec succès!"
echo ""
echo "📋 Résumé de la configuration:"
echo "  - Storage Account: $STORAGE_ACCOUNT_NAME"
echo "  - Container: $CONTAINER_NAME"
echo "  - Blob Endpoint: https://$STORAGE_ACCOUNT_NAME.blob.core.windows.net/"
echo ""
echo "💡 Vous pouvez maintenant démarrer le backend avec:"
echo "   cd $BACKEND_DIR"
echo "   npm start"

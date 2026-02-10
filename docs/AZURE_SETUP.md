# 🔧 Configuration Azure - Guide Complet

Ce guide vous accompagne pas à pas dans la configuration d'Azure pour ShareAzure.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Création du compte de stockage](#création-du-compte-de-stockage)
3. [Configuration des droits (RBAC)](#configuration-des-droits-rbac)
4. [Application Insights](#application-insights)
5. [Sécurité avancée](#sécurité-avancée)

## Prérequis

- Un abonnement Azure actif
- Azure CLI installé : https://docs.microsoft.com/cli/azure/install-azure-cli
- Ou accès au portail Azure : https://portal.azure.com

### Installation Azure CLI

```bash
# macOS
brew install azure-cli

# Windows
winget install Microsoft.AzureCLI

# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### Connexion

```bash
az login
```

## Création du compte de stockage

### Via Azure CLI

```bash
# 1. Créer un groupe de ressources
az group create \
  --name rg-shareazure \
  --location francecentral

# 2. Créer le compte de stockage
az storage account create \
  --name sastshareazure \
  --resource-group rg-shareazure \
  --location francecentral \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --allow-blob-public-access false \
  --min-tls-version TLS1_2

# 3. Récupérer la connection string
az storage account show-connection-string \
  --name sastshareazure \
  --resource-group rg-shareazure \
  --output tsv
```

### Via le Portail Azure

1. **Créer un groupe de ressources**
   - Portail Azure → Groupes de ressources → Créer
   - Nom : `rg-shareazure`
   - Région : France Centre

2. **Créer le compte de stockage**
   - Portail Azure → Comptes de stockage → Créer
   - **Paramètres de base :**
     - Abonnement : Votre abonnement
     - Groupe de ressources : `rg-shareazure`
     - Nom : `sastshareazure` (doit être unique globalement)
     - Région : France Centre
     - Performances : Standard
     - Redondance : LRS (stockage localement redondant)
   
   - **Avancé :**
     - Sécurité : Activer le chiffrement
     - Accès public Blob : Désactivé
     - Version TLS minimale : Version 1.2
   
   - Cliquez sur "Vérifier + créer"

3. **Récupérer les clés**
   - Compte de stockage → Sécurité + réseau → Clés d'accès
   - Afficher les clés
   - Copier "Chaîne de connexion"

## Configuration des droits (RBAC)

### Rôles Azure prédéfinis pour le stockage

```bash
# Lister les rôles disponibles
az role definition list \
  --query "[?contains(roleName, 'Storage')].{Name:roleName, ID:name}" \
  --output table
```

Rôles recommandés :
- **Storage Blob Data Contributor** : Lecture, écriture, suppression
- **Storage Blob Data Reader** : Lecture seule
- **Storage Blob Data Owner** : Contrôle total

### Attribuer un rôle à un utilisateur

```bash
# Récupérer l'ID du compte de stockage
STORAGE_ID=$(az storage account show \
  --name sastshareazure \
  --resource-group rg-shareazure \
  --query id \
  --output tsv)

# Attribuer le rôle à un utilisateur
az role assignment create \
  --assignee user@domain.com \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

### Attribuer un rôle à une application (Service Principal)

```bash
# 1. Créer un service principal
az ad sp create-for-rbac \
  --name shareazure-sp \
  --role "Storage Blob Data Contributor" \
  --scopes $STORAGE_ID

# Notez le output :
# {
#   "appId": "xxx",
#   "displayName": "shareazure-sp",
#   "password": "xxx",
#   "tenant": "xxx"
# }

# 2. Utiliser dans .env
AZURE_TENANT_ID=xxx
AZURE_CLIENT_ID=xxx (appId)
AZURE_CLIENT_SECRET=xxx (password)
```

### Via le Portail Azure

1. **Compte de stockage → Contrôle d'accès (IAM)**
2. Cliquez sur "Ajouter une attribution de rôle"
3. Sélectionnez le rôle (ex: Storage Blob Data Contributor)
4. Sélectionnez l'utilisateur ou l'application
5. Cliquez sur "Enregistrer"

## Application Insights

### Création

```bash
# 1. Créer Application Insights
az monitor app-insights component create \
  --app shareazure-insights \
  --location francecentral \
  --resource-group rg-shareazure \
  --application-type web

# 2. Récupérer la connection string
az monitor app-insights component show \
  --app shareazure-insights \
  --resource-group rg-shareazure \
  --query connectionString \
  --output tsv
```

### Via le Portail Azure

1. **Créer une ressource → Application Insights**
2. **Paramètres :**
   - Nom : `shareazure-insights`
   - Groupe de ressources : `rg-shareazure`
   - Région : France Centre
   - Type d'application : Node.js
3. Cliquez sur "Créer"
4. Une fois créé : Vue d'ensemble → Copier "Chaîne de connexion"

### Configuration dans l'application

Ajoutez dans `.env` :
```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;...
```

### Requêtes utiles

```kusto
// Requêtes par endpoint
requests
| summarize count() by name
| order by count_ desc

// Temps de réponse moyen
requests
| summarize avg(duration) by name

// Erreurs
exceptions
| project timestamp, problemId, outerMessage
| order by timestamp desc
```

## Sécurité avancée

### 1. Restreindre l'accès réseau

```bash
# Désactiver l'accès public
az storage account update \
  --name sastshareazure \
  --resource-group rg-shareazure \
  --default-action Deny

# Autoriser une IP spécifique
az storage account network-rule add \
  --account-name sastshareazure \
  --resource-group rg-shareazure \
  --ip-address 1.2.3.4
```

### 2. Activer la suppression réversible

```bash
az storage account blob-service-properties update \
  --account-name sastshareazure \
  --resource-group rg-shareazure \
  --enable-delete-retention true \
  --delete-retention-days 7
```

### 3. Chiffrement avec clés gérées par le client

```bash
# 1. Créer un Key Vault
az keyvault create \
  --name kv-shareazure \
  --resource-group rg-shareazure \
  --location francecentral

# 2. Créer une clé
az keyvault key create \
  --vault-name kv-shareazure \
  --name storage-encryption-key \
  --protection software

# 3. Configurer le compte de stockage
az storage account update \
  --name sastshareazure \
  --resource-group rg-shareazure \
  --encryption-key-source Microsoft.Keyvault \
  --encryption-key-vault https://kv-shareazure.vault.azure.net \
  --encryption-key-name storage-encryption-key
```

### 4. Génération de SAS (Shared Access Signature)

Pour partager des fichiers temporairement :

```bash
# Générer un SAS valide 1 heure
az storage blob generate-sas \
  --account-name sastshareazure \
  --container-name uploads \
  --name fichier.pdf \
  --permissions r \
  --expiry $(date -u -d "1 hour" '+%Y-%m-%dT%H:%MZ')
```

### 5. Azure Defender for Storage

```bash
# Activer Azure Defender
az security pricing create \
  --name StorageAccounts \
  --tier Standard
```

## 💰 Estimation des coûts

### Stockage
- **Standard LRS** : ~0.018 € / GB / mois
- **Transactions** : ~0.004 € / 10,000 transactions

### Monitoring
- **Application Insights** : Premier 5 GB/mois gratuit, puis ~2.30 € / GB

### Exemple pour 100 GB + 1M transactions/mois
- Stockage : 1.80 €
- Transactions : 0.40 €
- Application Insights (estimation) : 2.30 €
- **Total** : ~4.50 € / mois

## 📚 Ressources

- [Documentation Azure Storage](https://docs.microsoft.com/azure/storage/)
- [Azure RBAC](https://docs.microsoft.com/azure/role-based-access-control/)
- [Application Insights](https://docs.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [Sécurité du stockage](https://docs.microsoft.com/azure/storage/common/storage-security-guide)

## 🆘 Support

En cas de problème :
1. Consultez Application Insights pour les erreurs et métriques
2. Vérifiez les paramètres RBAC
3. Vérifiez les logs de l'application backend
4. Contactez le support Azure si nécessaire

# Infrastructure ShareAzure - Terraform

Ce répertoire contient la configuration Terraform pour provisionner l'infrastructure Azure nécessaire au projet ShareAzure.

## 📋 Prérequis

- [Terraform](https://www.terraform.io/downloads) >= 1.0 installé
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) installé et configuré
- Un compte Azure avec les permissions appropriées
- **Le resource group `rg-shareazure` doit déjà exister**

## 🏗️ Infrastructure provisionnée

Cette configuration Terraform crée :

- ✅ **Storage Account** : Compte de stockage Azure pour les fichiers
- ✅ **Blob Container** : Conteneur pour stocker les fichiers uploadés
- ✅ **Application Insights** : Monitoring et télémétrie (optionnel)

**Note importante** : Le resource group `rg-shareazure` n'est **pas créé** par Terraform. Il doit déjà exister.

## 🚀 Utilisation

### 1. Connexion à Azure

```bash
az login
az account set --subscription "011ab966-2d51-4b9b-a5f2-397425614082"
```

### 2. Vérifier que le provider Storage est enregistré

```bash
# Vérifier l'état
az provider show --namespace Microsoft.Storage --query "registrationState" -o tsv

# Si ce n'est pas "Registered", enregistrer le provider
az provider register --namespace Microsoft.Storage

# Attendre que le statut soit "Registered" (peut prendre 1-2 minutes)
watch -n 5 az provider show --namespace Microsoft.Storage --query "registrationState" -o tsv
```

### 3. Configuration

Le fichier `terraform.tfvars` est déjà configuré avec les bonnes valeurs. Vérifiez-le si nécessaire :

```hcl
resource_group_name     = "rg-shareazure"      # Resource group existant
storage_account_name    = "sastshareazure"     # Nom unique du storage account
location                = "francecentral"
```

### 4. Initialisation et déploiement

```bash
cd infrastructure

# Initialiser Terraform
terraform init

# Vérifier le plan d'exécution
terraform plan

# Appliquer la configuration
terraform apply
```

### 5. Récupérer les informations de connexion

```bash
# Afficher tous les outputs
terraform output

# Récupérer une valeur spécifique (sensible)
terraform output -raw storage_account_primary_connection_string
terraform output -raw storage_account_primary_access_key
```

### 6. Configuration de l'application

Ajoutez les informations dans votre fichier `backend/.env` :

```env
AZURE_STORAGE_CONNECTION_STRING=<output de terraform>
AZURE_CONTAINER_NAME=uploads
APPLICATIONINSIGHTS_CONNECTION_STRING=<output de terraform>
```

## 📦 Ressources créées

- **Storage Account** : Compte de stockage avec chiffrement et sécurité renforcée
- **Storage Container** : Conteneur `uploads` avec accès privé
- **Application Insights** : Monitoring de l'application (optionnel)

**Note** : Le resource group `rg-shareazure` est utilisé mais **pas créé** par Terraform.

## 🔒 Sécurité

Le storage account est configuré avec :
- ✅ Accès public aux blobs désactivé par défaut
- ✅ TLS 1.2 minimum requis
- ✅ HTTPS uniquement
- ✅ Chiffrement de l'infrastructure activé
- ✅ Soft delete activé (7 jours)
- ✅ Versioning des blobs activé
- ✅ CORS configuré pour accès web

## 🗑️ Nettoyage

Pour supprimer l'infrastructure créée :

```bash
terraform destroy
```

**Attention** : Le resource group `rg-shareazure` ne sera PAS supprimé car il n'est pas géré par Terraform.

## 📝 Variables configurables

| Variable | Description | Par défaut | Requis |
|----------|-------------|------------|--------|
| `resource_group_name` | Nom du resource group existant | - | ✅ |
| `storage_account_name` | Nom du storage account | - | ✅ |
| `project_name` | Nom du projet | `shareazure` | ❌ |
| `location` | Région Azure | `francecentral` | ❌ |
| `container_name` | Nom du conteneur | `uploads` | ❌ |
| `storage_account_tier` | Tier du storage | `Standard` | ❌ |
| `storage_replication_type` | Type de réplication | `LRS` | ❌ |
| `allow_blob_public_access` | Accès public aux blobs | `false` | ❌ |
| `min_tls_version` | Version TLS minimale | `TLS1_2` | ❌ |
| `enable_application_insights` | Créer App Insights | `true` | ❌ |

## 📊 Outputs disponibles

Après le déploiement, les informations suivantes sont disponibles :

- `resource_group_name` : Nom du resource group utilisé
- `storage_account_name` : Nom du storage account
- `storage_account_id` : ID Azure du storage account
- `storage_account_primary_connection_string` : Chaîne de connexion (sensible)
- `storage_account_primary_access_key` : Clé d'accès (sensible)
- `storage_account_primary_blob_endpoint` : URL du blob endpoint
- `container_name` : Nom du conteneur créé
- `application_insights_connection_string` : Connection string App Insights (sensible)

## 🔧 Dépannage

### Erreur "Subscription not found"

Si vous obtenez une erreur `SubscriptionNotFound`, assurez-vous que :

1. Le provider `Microsoft.Storage` est bien enregistré et en statut "Registered"
2. Vous êtes connecté à Azure CLI
3. La subscription est bien définie

```bash
az provider register --namespace Microsoft.Storage
az account set --subscription "011ab966-2d51-4b9b-a5f2-397425614082"
```

### Erreur "Resource group not found"

Vérifiez que le resource group existe :

```bash
az group show --name rg-shareazure
```

Si non, créez-le :

```bash
az group create --name rg-shareazure --location francecentral
```

### Nom de storage account déjà pris

Si le nom `sastshareazure` est déjà utilisé globalement, changez-le dans `terraform.tfvars` :

```hcl
storage_account_name = "sastshareazure001"  # ou un autre nom unique
```

## 📚 Ressources

- [Documentation Azure Storage](https://docs.microsoft.com/azure/storage/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Documentation Terraform](https://www.terraform.io/docs)


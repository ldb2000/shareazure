# 🚀 Démarrage rapide - Infrastructure ShareAzure

## Option 1 : Utiliser le script automatisé (Recommandé)

```bash
cd infrastructure
./deploy.sh
```

Le script va automatiquement :
- ✅ Vérifier les prérequis (Terraform, Azure CLI)
- ✅ Vérifier la connexion Azure
- ✅ Vérifier que le resource group existe
- ✅ Enregistrer le provider Microsoft.Storage si nécessaire
- ✅ Initialiser Terraform
- ✅ Valider la configuration
- ✅ Afficher le plan d'exécution
- ✅ Déployer l'infrastructure après confirmation

## Option 2 : Déploiement manuel

### 1. Prérequis ⚠️

Avant de commencer, **vérifiez impérativement** :

```bash
# Le provider Microsoft.Storage DOIT être "Registered"
az provider show --namespace Microsoft.Storage --query "registrationState" -o tsv

# Si pas "Registered", enregistrez-le et attendez
az provider register --namespace Microsoft.Storage
```

⏱️ **L'enregistrement peut prendre 1-2 minutes**. Ne continuez pas avant que le statut soit "Registered" !

### 2. Connexion Azure

```bash
az login
az account set --subscription "011ab966-2d51-4b9b-a5f2-397425614082"
```

### 3. Déploiement

```bash
cd infrastructure

# Initialiser Terraform
terraform init

# Voir ce qui va être créé
terraform plan

# Créer les ressources
terraform apply
```

### 4. Récupérer les credentials

```bash
# Connection string pour l'application
terraform output -raw storage_account_primary_connection_string

# Clé d'accès
terraform output -raw storage_account_primary_access_key

# Tous les outputs
terraform output
```

## 📋 Checklist avant déploiement

- [ ] Azure CLI installé et connecté
- [ ] Terraform >= 1.0 installé
- [ ] Resource group `rg-shareazure` existe
- [ ] Provider `Microsoft.Storage` en état "Registered"
- [ ] Fichier `terraform.tfvars` vérifié

## ⚡ Commandes utiles

```bash
# Voir l'état actuel
terraform show

# Formater les fichiers
terraform fmt

# Valider la configuration
terraform validate

# Détruire l'infrastructure
terraform destroy
```

## 🆘 En cas de problème

### Erreur "SubscriptionNotFound"
```bash
az provider register --namespace Microsoft.Storage
# Attendre que le statut soit "Registered"
```

### Erreur "Resource group not found"
```bash
az group create --name rg-shareazure --location francecentral
```

### Nom du storage account déjà pris
Modifier dans `terraform.tfvars` :
```hcl
storage_account_name = "sastshareazure001"
```

## 📚 Documentation complète

Consultez [README.md](README.md) pour plus de détails.

# ShareAzure — Guide d'installation complet

Ce guide couvre l'installation complete de ShareAzure, de l'infrastructure Azure (Terraform) a la configuration de l'application (`.env`), en passant par les fonctionnalites IA.

---

## Table des matieres

1. [Pre-requis](#1-pre-requis)
2. [Infrastructure Azure avec Terraform](#2-infrastructure-azure-avec-terraform)
3. [Configuration du backend (.env)](#3-configuration-du-backend-env)
4. [Installation des dependances](#4-installation-des-dependances)
5. [Lancement de l'application](#5-lancement-de-lapplication)
6. [Configuration IA (optionnel)](#6-configuration-ia-optionnel)
7. [Verification](#7-verification)
8. [Script d'installation rapide](#8-script-dinstallation-rapide)

---

## 1. Pre-requis

### Outils necessaires

| Outil | Version | Installation |
|-------|---------|-------------|
| **Node.js** | >= 18 | https://nodejs.org |
| **npm** | >= 9 | Inclus avec Node.js |
| **Azure CLI** | >= 2.50 | `brew install azure-cli` ou https://aka.ms/installazurecli |
| **Terraform** | >= 1.0 | `brew install terraform` ou https://developer.hashicorp.com/terraform/install |
| **ffmpeg** | >= 5.0 | `brew install ffmpeg` (requis pour l'analyse video/audio IA) |

### Compte Azure

- Un abonnement Azure actif
- Un Resource Group existant (ex: `rg-shareazure`)
- Permissions: `Contributor` ou `Owner` sur le Resource Group

### Connexion Azure CLI

```bash
# Se connecter
az login

# Verifier le bon abonnement
az account show --output table

# Changer d'abonnement si necessaire
az account set --subscription "NOM_OU_ID_ABONNEMENT"

# Enregistrer les providers necessaires (premiere fois uniquement)
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.CognitiveServices
az provider register --namespace Microsoft.Insights
```

---

## 2. Infrastructure Azure avec Terraform

Terraform provisionne automatiquement:
- **Storage Account** + Container blob (stockage des fichiers)
- **Application Insights** (monitoring, optionnel)
- **Cognitive Services — Computer Vision** (IA, optionnel)

### Etape 1 : Configurer les variables

```bash
cd infrastructure/

# Copier le fichier d'exemple
cp terraform.tfvars.example terraform.tfvars
```

Editer `terraform.tfvars` :

```hcl
# OBLIGATOIRE — nom du Resource Group existant
resource_group_name = "rg-shareazure"

# OBLIGATOIRE — nom unique globalement (minuscules + chiffres, 3-24 chars)
storage_account_name = "sastshareazure"

# Optionnel (valeurs par defaut ci-dessous)
project_name                = "shareazure"
location                    = "francecentral"
container_name              = "uploads"
storage_account_tier        = "Standard"
storage_replication_type    = "LRS"
allow_blob_public_access    = false
min_tls_version             = "TLS1_2"
enable_application_insights = true

# IA — Azure Computer Vision
enable_cognitive_services   = true          # false pour desactiver
cognitive_services_sku      = "S1"          # F0 = gratuit (20 appels/min), S1 = standard
```

> **Note SKU Cognitive Services :**
> - `F0` : Gratuit, 20 appels/minute, 5000/mois — ideal pour le developpement
> - `S1` : Standard, 10 appels/seconde — recommande pour la production

### Etape 2 : Initialiser Terraform

```bash
# Telecharger les providers
terraform init
```

Sortie attendue :
```
Terraform has been successfully initialized!
```

### Etape 3 : Previsualiser les changements

```bash
terraform plan
```

Cette commande affiche les ressources qui seront creees **sans rien modifier**. Verifiez que vous voyez :
- `azurerm_storage_account.main` — will be created
- `azurerm_storage_container.uploads` — will be created
- `azurerm_application_insights.main[0]` — will be created (si active)
- `azurerm_cognitive_account.vision[0]` — will be created (si active)

### Etape 4 : Deployer

```bash
terraform apply
```

Terraform demande confirmation — tapez `yes`.

Le deploiement prend **2-5 minutes**.

### Etape 5 : Recuperer les outputs

```bash
# Voir tous les outputs
terraform output

# Recuperer la connection string (pour .env)
terraform output -raw storage_account_primary_connection_string

# Recuperer l'endpoint Cognitive Services (pour .env)
terraform output -raw cognitive_services_endpoint

# Recuperer la cle Cognitive Services (pour .env)
terraform output -raw cognitive_services_key

# Recuperer la connection string App Insights (pour .env)
terraform output -raw application_insights_connection_string
```

> **Important :** Ces valeurs sont sensibles. Ne les commitez jamais dans git.

### Commandes Terraform utiles

```bash
# Voir l'etat actuel
terraform show

# Detruire toute l'infrastructure (ATTENTION !)
terraform destroy

# Importer une ressource existante
terraform import azurerm_storage_account.main /subscriptions/SUB_ID/resourceGroups/RG/providers/Microsoft.Storage/storageAccounts/NAME

# Mettre a jour apres modification de main.tf
terraform plan    # previsualiser
terraform apply   # appliquer
```

---

## 3. Configuration du backend (.env)

### Etape 1 : Copier le template

```bash
cd backend/
cp .env.example .env
```

### Etape 2 : Remplir les valeurs

Editer `backend/.env` avec les valeurs de Terraform :

```bash
# ======================================================
# AZURE STORAGE (OBLIGATOIRE)
# ======================================================
# Recuperer via: terraform output -raw storage_account_primary_connection_string
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net

# Nom du compte (pour info)
AZURE_STORAGE_ACCOUNT_NAME=sastshareazure
AZURE_STORAGE_ACCOUNT_KEY=votre_cle

# Conteneur blob
AZURE_CONTAINER_NAME=uploads

# ======================================================
# SERVEUR
# ======================================================
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000

# ======================================================
# MONITORING (optionnel)
# ======================================================
# Recuperer via: terraform output -raw application_insights_connection_string
# APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...

# ======================================================
# IA — OPENAI (optionnel, pour analyse semantique)
# ======================================================
# Creer une cle sur: https://platform.openai.com/api-keys
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o
# OPENAI_WHISPER_MODEL=whisper-1

# ======================================================
# IA — AZURE COMPUTER VISION (optionnel, pour detection structurelle)
# ======================================================
# Recuperer via Terraform:
#   terraform output -raw cognitive_services_endpoint
#   terraform output -raw cognitive_services_key
# AZURE_VISION_ENDPOINT=https://cog-shareazure.cognitiveservices.azure.com/
# AZURE_VISION_KEY=votre_cle_cognitive

# ======================================================
# IA — OPTIONS
# ======================================================
# FFMPEG_PATH=/usr/local/bin/ffmpeg
# AI_MAX_CONCURRENT_JOBS=3
# AI_AUTO_ANALYZE_ON_UPLOAD=false

# ======================================================
# EMAIL (optionnel, pour comptes invites)
# ======================================================
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=votre_email@gmail.com
# SMTP_PASSWORD=votre_mot_de_passe_app
# SMTP_FROM_EMAIL=noreply@shareazure.com
# APP_NAME=ShareAzure
```

### Correspondance Terraform → .env

| Output Terraform | Variable .env |
|-----------------|---------------|
| `storage_account_primary_connection_string` | `AZURE_STORAGE_CONNECTION_STRING` |
| `storage_account_name` | `AZURE_STORAGE_ACCOUNT_NAME` |
| `storage_account_primary_access_key` | `AZURE_STORAGE_ACCOUNT_KEY` |
| `container_name` | `AZURE_CONTAINER_NAME` |
| `application_insights_connection_string` | `APPLICATIONINSIGHTS_CONNECTION_STRING` |
| `cognitive_services_endpoint` | `AZURE_VISION_ENDPOINT` |
| `cognitive_services_key` | `AZURE_VISION_KEY` |

---

## 4. Installation des dependances

```bash
cd backend/
npm install
```

Verifier l'installation :

```bash
# Tester la connexion Azure
node test-connection.js
```

Sortie attendue :
```
✅ Connexion au compte de stockage reussie
✅ Conteneur 'uploads' accessible
```

---

## 5. Lancement de l'application

### Option A : Script automatique (recommande)

```bash
# Depuis la racine du projet
./scripts/start-dev.sh
```

Cela lance :
- Backend sur `http://localhost:3000`
- Frontend sur `http://localhost:8080`

### Option B : Lancement manuel

Terminal 1 — Backend :
```bash
cd backend/
npm run dev    # avec nodemon (auto-reload)
# ou
npm start      # sans auto-reload
```

Terminal 2 — Frontend :
```bash
cd frontend/
python3 -m http.server 8080
# ou
npx http-server -p 8080
```

### Option C : Docker

```bash
docker-compose up -d
```

### Arret

```bash
./scripts/stop-dev.sh
# ou
docker-compose down
```

---

## 6. Configuration IA (optionnel)

L'IA se configure via **deux niveaux** :

### Niveau 1 : Variables d'environnement (.env)

Les cles API et endpoints sont dans `.env` (voir section 3). Sans ces valeurs, les services correspondants sont desactives automatiquement.

| Service | Variables necessaires | Fonctionnalites |
|---------|---------------------|-----------------|
| **OpenAI GPT-4 Vision** | `OPENAI_API_KEY` | Analyse semantique, tags, descriptions |
| **Azure Computer Vision** | `AZURE_VISION_ENDPOINT` + `AZURE_VISION_KEY` | Detection faciale, objets, OCR |
| **Whisper** | `OPENAI_API_KEY` (meme cle) | Transcription audio/video |
| **Geolocalisation** | Aucune (utilise exifr + Nominatim OSM) | Extraction GPS EXIF, reverse geocoding |

### Niveau 2 : Settings admin (interface web)

Une fois l'application lancee, allez dans **Admin > IA** pour configurer finement :

| Sous-onglet | Ce qu'on configure |
|-------------|-------------------|
| **Dashboard** | Visualisation : analyses, couts, tags, file d'attente |
| **Services** | Toggles on/off pour chaque service (OpenAI, Azure Vision, Whisper, faces, geo, search, albums, video, auto-analyze, reverse geocoding) |
| **Parametres** | Modeles (gpt-4o, whisper-1), seuils (confiance faciale), intervalle video, taille thumbnails, budget mensuel |
| **Scans** | Planification des scans (manuel/horaire/quotidien/hebdomadaire), lancement manuel |
| **Carte** | Carte Leaflet.js des fichiers geotagues |

### Cle OpenAI

1. Aller sur https://platform.openai.com/api-keys
2. Creer une cle API
3. La mettre dans `OPENAI_API_KEY` du `.env`
4. Budget recommande : configurer un plafond mensuel sur https://platform.openai.com/settings/organization/limits

### Azure Computer Vision

Deja cree par Terraform (si `enable_cognitive_services = true`). Les outputs donnent endpoint et cle :

```bash
cd infrastructure/
terraform output -raw cognitive_services_endpoint   # → AZURE_VISION_ENDPOINT
terraform output -raw cognitive_services_key          # → AZURE_VISION_KEY
```

### Scans planifies

Les 4 types de scans :

| Type | Description | Planification recommandee |
|------|-------------|--------------------------|
| `face_recognition` | Detection des visages dans les images/videos | `daily` |
| `auto_tagging` | Tags automatiques via OpenAI + Azure Vision | `daily` |
| `geolocation_extraction` | Extraction GPS des metadonnees EXIF | `daily` |
| `full_analysis` | Analyse complete (tous les services) | `weekly` |

Configurer via Admin > IA > Scans, ou via API :
```bash
# Passer le scan face_recognition en quotidien
curl -X PUT http://localhost:3000/api/admin/ai/scans/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -d '{"schedule": "daily"}'
```

---

## 7. Verification

### Checklist de verification

```bash
# 1. Sante du backend
curl http://localhost:3000/api/health
# Attendu: {"status":"ok","timestamp":"..."}

# 2. Initialiser le conteneur Azure
curl -X POST http://localhost:3000/api/container/init
# Attendu: {"success":true}

# 3. Tester un upload
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/chemin/vers/un/fichier.pdf"
# Attendu: {"success":true,"file":{...}}

# 4. Verifier l'IA (si configuree)
curl http://localhost:3000/api/admin/ai/dashboard \
  -H "Authorization: Bearer VOTRE_TOKEN"
# Attendu: {"success":true,"dashboard":{...}}

# 5. Verifier les scans
curl http://localhost:3000/api/admin/ai/scans \
  -H "Authorization: Bearer VOTRE_TOKEN"
# Attendu: {"success":true,"scans":[...4 scans...]}
```

### Interfaces web

| Interface | URL | Description |
|-----------|-----|-------------|
| Frontend | http://localhost:8080 | Upload et gestion des fichiers |
| Admin | http://localhost:8080/admin/ | Dashboard d'administration |
| API Health | http://localhost:3000/api/health | Sante du backend |

---

## 8. Script d'installation rapide

Un script `setup.sh` est fourni dans ce dossier pour automatiser les etapes 3-5 :

```bash
cd docs/installation/
chmod +x setup.sh
./setup.sh
```

Le script :
1. Verifie les pre-requis (node, npm, ffmpeg)
2. Copie `.env.example` vers `.env` (si necessaire)
3. Installe les dependances npm
4. Teste la connexion Azure
5. Propose de lancer l'application

---

## Depannage

### Erreur "Port already in use"

```bash
lsof -ti:3000 | xargs kill -9
```

### Erreur connexion Azure

```bash
# Verifier les variables d'environnement
cd backend/ && node test-connection.js

# Verifier que le storage account existe
az storage account show --name sastshareazure --resource-group rg-shareazure
```

### Erreur Terraform "resource group not found"

```bash
# Creer le resource group manuellement
az group create --name rg-shareazure --location francecentral
```

### Erreur Cognitive Services "sku not available"

```bash
# Verifier les SKUs disponibles dans la region
az cognitiveservices account list-skus --kind ComputerVision --location francecentral

# Utiliser F0 (gratuit) si S1 n'est pas disponible
# Dans terraform.tfvars: cognitive_services_sku = "F0"
```

### Erreur "database locked"

```bash
# S'assurer qu'une seule instance du backend tourne
lsof -ti:3000 | xargs kill -9

# Supprimer le journal de verrouillage
rm -f backend/shareazure.db-journal
```

### ffmpeg non trouve (analyse video)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Ou specifier le chemin dans .env
FFMPEG_PATH=/usr/local/bin/ffmpeg
```

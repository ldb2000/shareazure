# 📦 ShareAzure

Application web d'upload de fichiers vers Azure Blob Storage avec interface drag & drop moderne.

## 🎯 Fonctionnalités

### Fonctionnalités de base
- ✅ Upload de fichiers vers Azure Blob Storage
- ✅ Interface drag & drop intuitive
- ✅ Upload de fichiers multiples
- ✅ Barre de progression en temps réel
- ✅ 👁️ **Preview de fichiers** (images, PDF, vidéo, audio, texte)
- ✅ Liste des fichiers uploadés
- ✅ Téléchargement de fichiers
- ✅ Suppression de fichiers
- ✅ Logs des opérations
- ✅ Gestion des permissions
- ✅ Rate limiting intégré
- ✅ Responsive design

### Fonctionnalités avancées de partage (v2.0+)
- ✅ 🔗 **Partage avec liens temporaires** (SAS tokens)
- ✅ 📊 **Historique des liens générés** avec statistiques
- ✅ 📱 **QR Code automatique** pour chaque lien
- ✅ 🔒 **Protection par mot de passe** optionnelle
- ✅ 📈 **Compteur de téléchargements** avec logs détaillés
- ✅ 🗄️ **Base de données SQLite** pour la persistence
- ✅ ❌ **Révocation manuelle** des liens actifs
- ✅ 📧 **Partage ciblé par email** : Email obligatoire lors de la création d'un lien
- ✅ 📋 **Support de plusieurs emails** : Possibilité de partager à plusieurs destinataires
- ✅ 🛡️ **Domaines d'emails autorisés** : Contrôle des domaines autorisés par l'administrateur

### Fonctionnalites IA / Multimedia (v3.0+)
- ✅ **Analyse d'images et videos** via OpenAI GPT-4 Vision et Azure AI Vision
- ✅ **Transcription audio/video** via OpenAI Whisper
- ✅ **Extraction de geolocalisation** (EXIF GPS + reverse geocoding Nominatim)
- ✅ **Recherche semantique** avec FTS5 full-text search
- ✅ **Albums intelligents** avec regles automatiques
- ✅ **Reconnaissance faciale** avec galerie de profils

### Section "Decouvrir" (v3.1+)
- ✅ **Nuage de tags** : navigation par tags IA, taille proportionnelle a la frequence
- ✅ **Recherche IA** : recherche semantique avec suggestions autocomplete et filtres par type
- ✅ **Carte interactive** : carte Leaflet.js avec MarkerCluster pour les fichiers geotagues

### Interface d'Administration 🆕 (v2.0+)
- ✅ 📊 **Dashboard complet** avec statistiques et graphiques
- ✅ 📁 **Gestion avancée des fichiers** (recherche, filtres, tri, actions en masse)
- ✅ 🔗 **Historique complet des partages** avec export CSV
- ✅ 📋 **Logs système** avec filtres et export
- ✅ ⚙️ **Paramètres configurables** (stockage, partage, sécurité, notifications)
- ✅ 📈 **Graphiques Chart.js** (uploads par jour, types de fichiers)
- ✅ 🎨 **Design moderne et responsive**
- ✅ 📧 **Gestion des domaines d'emails autorisés** : Ajout, suppression, activation/désactivation des domaines
- ⏳ 👥 **Gestion des utilisateurs** (prévu avec Azure AD B2C)

## 🏗️ Architecture

```
shareazure/
├── backend/           # API Node.js + Express
│   ├── server.js     # Serveur principal
│   ├── package.json  # Dépendances
│   └── .env         # Configuration (à créer)
├── frontend/         # Interface utilisateur
│   ├── index.html   # Page principale
│   ├── styles.css   # Styles
│   └── app.js       # Logique frontend
├── admin/           # Interface d'administration 🆕
│   ├── index.html   # Dashboard admin
│   ├── css/
│   │   └── admin.css  # Styles admin
│   └── js/
│       └── admin.js   # Logique admin
├── docs/            # Documentation
│   ├── ADMIN_INTERFACE.md  # Doc admin 🆕
│   └── ...
└── scripts/         # Scripts utilitaires
```

## 🚀 Installation

### Prérequis

- Node.js 18+ et npm
- Un compte Azure avec accès à Azure Storage
- Un compte de stockage Azure créé

### 1. Configuration Azure

#### Créer un compte de stockage Azure

```bash
# Via Azure CLI
az storage account create \
  --name votrecomptestorage \
  --resource-group votre-groupe \
  --location francecentral \
  --sku Standard_LRS
```

#### Récupérer la clé de connexion

```bash
# Via Azure CLI
az storage account show-connection-string \
  --name votrecomptestorage \
  --resource-group votre-groupe
```

Ou via le portail Azure :
1. Allez dans votre compte de stockage
2. Paramètres → Clés d'accès
3. Copiez la chaîne de connexion

### 2. Installation du backend

```bash
cd backend
npm install
```

### 3. Configuration

Créez un fichier `.env` dans le dossier `backend/` :

```bash
cp .env.example .env
```

Éditez `.env` avec vos informations Azure :

```env
# Configuration Azure Storage
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...

# Configuration du conteneur
AZURE_CONTAINER_NAME=uploads

# Configuration serveur
PORT=3000
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000

# Limites d'upload
MAX_FILE_SIZE_MB=100
```

### 4. Créer le conteneur Azure

```bash
# Démarrer le serveur
npm start

# Dans un autre terminal, créer le conteneur
curl -X POST http://localhost:3000/api/container/init
```

## 🎮 Utilisation

### Démarrer le backend

```bash
cd backend
npm start
```

Le serveur démarre sur `http://localhost:3000`

### Démarrer le frontend

Option 1 - Serveur HTTP simple (Python) :
```bash
cd frontend
python3 -m http.server 8080
```

Option 2 - Serveur HTTP simple (Node.js) :
```bash
cd frontend
npx http-server -p 8080
```

Ouvrez votre navigateur sur `http://localhost:8080`

## 📖 API Documentation

### Endpoints disponibles

#### GET `/api/health`
Vérifier la santé du serveur

**Réponse :**
```json
{
  "status": "OK",
  "timestamp": "2025-01-07T12:00:00.000Z",
  "service": "shareazure-backend"
}
```

#### POST `/api/container/init`
Créer le conteneur s'il n'existe pas

#### POST `/api/upload`
Uploader un fichier unique

**Body :** FormData avec champ `file`

**Réponse :**
```json
{
  "success": true,
  "message": "Fichier uploadé avec succès",
  "file": {
    "blobName": "uuid.ext",
    "originalName": "fichier.pdf",
    "size": 1024000,
    "contentType": "application/pdf",
    "url": "https://..."
  }
}
```

#### POST `/api/upload/multiple`
Uploader plusieurs fichiers

**Body :** FormData avec champ `files[]` (max 10)

#### GET `/api/files`
Lister tous les fichiers

**Réponse :**
```json
{
  "success": true,
  "count": 5,
  "files": [...]
}
```

#### GET `/api/download/:blobName`
Télécharger un fichier

#### GET `/api/preview/:blobName`
Prévisualiser un fichier (affichage inline)

**Réponse :** Stream du fichier avec headers appropriés

#### POST `/api/share/generate`
Générer un lien de partage temporaire avec SAS token

**Body :**
```json
{
  "blobName": "uuid.ext",
  "expiresInMinutes": 60,
  "permissions": "r"
}
```

**Réponse :**
```json
{
  "success": true,
  "shareLink": "https://...",
  "expiresAt": "2025-01-08T14:30:00.000Z",
  "file": {...}
}
```

#### GET `/api/share/info/:blobName`
Obtenir les informations d'un fichier

#### DELETE `/api/files/:blobName`
Supprimer un fichier

#### GET `/api/admin/email-domains`
Récupérer tous les domaines d'emails autorisés (admin uniquement)

**Réponse :**
```json
{
  "success": true,
  "domains": [
    {
      "id": 1,
      "domain": "example.com",
      "created_at": "2025-01-12T10:00:00.000Z",
      "is_active": 1
    }
  ]
}
```

#### POST `/api/admin/email-domains`
Ajouter un domaine autorisé (admin uniquement)

**Body :**
```json
{
  "domain": "example.com"
}
```

#### DELETE `/api/admin/email-domains/:domain`
Supprimer un domaine autorisé (admin uniquement)

#### PUT `/api/admin/email-domains/:domain/activate`
Activer un domaine (admin uniquement)

#### PUT `/api/admin/email-domains/:domain/deactivate`
Désactiver un domaine (admin uniquement)

## 🔒 Sécurité

### Mesures de sécurité implémentées

- ✅ Rate limiting (100 requêtes/15min par IP)
- ✅ Helmet.js pour headers de sécurité
- ✅ CORS configuré
- ✅ Validation des types de fichiers
- ✅ Limite de taille de fichiers
- ✅ Noms de fichiers uniques (UUID)
- ✅ Accès privé au conteneur par défaut
- ✅ **Protection des mots de passe** : Les mots de passe ne transitent jamais dans l'URL
- ✅ **Domaines d'emails autorisés** : Contrôle des domaines autorisés pour les partages
- ✅ **Validation des emails** : Vérification du format et du domaine autorisé

### Pour la production

1. **Activer HTTPS** : Utilisez un reverse proxy (nginx, Caddy)
2. **Azure AD** : Ajouter l'authentification Azure AD B2C
3. **Application Insights** : Configurer le monitoring
4. **Firewall** : Limiter l'accès au conteneur
5. **Variables d'environnement** : Ne jamais commit .env

## 📊 Logs et Monitoring

Les logs sont actuellement en console. Pour la production :

### Azure Application Insights

1. Créer une ressource Application Insights
2. Ajouter la connection string dans `.env`
3. Les logs seront automatiquement envoyés

```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
```

### Format des logs

Tous les logs sont en JSON :
```json
{
  "timestamp": "2025-01-07T12:00:00.000Z",
  "operation": "file_uploaded",
  "blobName": "uuid.ext",
  "originalName": "fichier.pdf",
  "size": 1024000
}
```

## 🐳 Déploiement

### Docker

Créez un `Dockerfile` dans le dossier `backend/` :

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

Build et run :
```bash
docker build -t shareazure-backend .
docker run -p 3000:3000 --env-file .env shareazure-backend
```

### Infrastructure Azure avec Terraform

Pour créer les ressources Azure Storage nécessaires :

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

Récupérez la chaîne de connexion :
```bash
terraform output -raw storage_account_primary_connection_string
```

Voir [infrastructure/README.md](infrastructure/README.md) pour plus de détails.

## 🔧 Développement

### Environnement de développement

```bash
# Backend avec auto-reload
cd backend
npm run dev

# Frontend avec live-server
cd frontend
npx live-server --port=8080
```

### Tests

```bash
# Test de l'API
curl http://localhost:3000/api/health

# Upload test
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.pdf"
```

## 🆘 Troubleshooting

### Erreur de connexion Azure

```
Error: Unable to connect to Azure Storage
```

**Solution :** Vérifiez votre connection string dans `.env`

### CORS Error

```
Access to fetch at 'http://localhost:3000' has been blocked by CORS policy
```

**Solution :** Ajoutez l'origine du frontend dans `ALLOWED_ORIGINS`

### Erreur de taille de fichier

```
Error: File too large
```

**Solution :** Augmentez `MAX_FILE_SIZE_MB` dans `.env`

## 📚 Documentation Complète

Voir **[docs/README.md](docs/README.md)** pour l'index complet de la documentation.

### Guides
- **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** - Guide de démarrage complet
- **[docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)** - Résumé du projet et métriques

### Fonctionnalités
- **[docs/PREVIEW_FEATURE.md](docs/PREVIEW_FEATURE.md)** - Preview de fichiers
- **[docs/SHARE_FEATURE.md](docs/SHARE_FEATURE.md)** - Partage avec liens temporaires
- **[docs/ADVANCED_FEATURES.md](docs/ADVANCED_FEATURES.md)** - Fonctionnalités avancées v2.0
- **[docs/GUEST_ACCOUNTS.md](docs/GUEST_ACCOUNTS.md)** - Comptes invités
- **[docs/ADMIN_INTERFACE.md](docs/ADMIN_INTERFACE.md)** - Interface d'administration
- **[docs/AI_FEATURES.md](docs/AI_FEATURES.md)** - Fonctionnalites IA et section Decouvrir

### Configuration et architecture
- **[docs/AZURE_SETUP.md](docs/AZURE_SETUP.md)** - Configuration Azure détaillée
- **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** - Guide de personnalisation
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Diagrammes d'architecture
- **[docs/API_EXAMPLES.md](docs/API_EXAMPLES.md)** - Exemples API

### Autres
- **[CHANGELOG.md](CHANGELOG.md)** - Historique des versions

## 📝 TODO / Améliorations futures

### Court terme
- [ ] Limitation des tentatives de mot de passe
- [ ] Notification par email lors de partage
- [ ] Export des statistiques en CSV
- [ ] Authentification Azure AD B2C

### Moyen terme
- [ ] Zoom manuel et rotation pour images
- [ ] Recherche et filtres de fichiers
- [ ] Gestion des dossiers/catégories
- [ ] Upload via API REST (sans interface)
- [ ] Compression automatique d'images

### Long terme
- [ ] Scan antivirus des fichiers
- [ ] Versioning de fichiers
- [ ] Application mobile native
- [ ] Webhooks pour événements

### ✅ Complété
- [x] ✅ **Partage de fichiers avec liens temporaires (SAS)** - v1.2.0
- [x] ✅ **Historique des liens de partage générés** - v2.0.0
- [x] ✅ **QR Code pour les liens** - v2.0.0
- [x] ✅ **Protection par mot de passe** - v2.0.0
- [x] ✅ **Compteur de téléchargements** - v2.0.0

## 📄 Licence

MIT

## 👤 Auteur

Lolo - APRIL

## 🙏 Remerciements

- Azure SDK pour Node.js
- Express.js
- Multer pour le multipart/form-data

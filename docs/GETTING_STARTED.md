# 🚀 Commencer avec ShareAzure

Bienvenue sur ShareAzure ! Ce guide vous aidera à démarrer rapidement.

## 📋 Ce que vous allez construire

Une application web moderne pour uploader des fichiers vers Azure Blob Storage avec :
- ✨ Interface drag & drop intuitive
- 📊 Gestion complète des fichiers (upload, liste, téléchargement, suppression)
- 🔒 Sécurité intégrée (rate limiting, validation, logs)
- 📈 Monitoring avec Application Insights
- 🐳 Déploiement Docker prêt

## 🎯 Pour qui ?

- **Développeurs** souhaitant intégrer Azure Storage dans leurs applications
- **Équipes IT** nécessitant une solution d'upload sécurisée
- **Entreprises** voulant centraliser le partage de fichiers

## ⚡ Démarrage Rapide (3 étapes)

### 1️⃣ Configuration Azure (5 min)

```bash
# Se connecter à Azure
az login

# Créer les ressources
az group create --name rg-shareazure --location francecentral
az storage account create \
  --name sastshareazure$(date +%s) \
  --resource-group rg-shareazure \
  --location francecentral \
  --sku Standard_LRS

# Récupérer la connection string
az storage account show-connection-string \
  --name sastshareazure* \
  --resource-group rg-shareazure
```

### 2️⃣ Configuration de l'application (2 min)

```bash
# Cloner ou créer le projet
cd /chemin/vers/shareazure

# Backend
cd backend
npm install
cp .env.example .env
# Éditer .env avec votre connection string
```

### 3️⃣ Lancer l'application (1 min)

**Option A - Script automatique :**
```bash
./scripts/start-dev.sh
```

**Option B - Manuel :**
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
python3 -m http.server 8080
```

🎉 **Ouvrez http://localhost:8080** et commencez à uploader !

## 📚 Documentation Complète

### Guides essentiels

1. **[README.md](../README.md)** - Vue d'ensemble et installation détaillée
2. **[AZURE_SETUP.md](AZURE_SETUP.md)** - Configuration Azure détaillée
3. **[CUSTOMIZATION.md](CUSTOMIZATION.md)** - Personnalisation et extensions

### Structure du projet

```
shareazure/
├── 📄 README.md                 # Documentation principale
├── 📄 GETTING_STARTED.md        # Ce fichier
├── 📄 docker-compose.yml        # Déploiement Docker
├── 📄 nginx.conf                # Configuration Nginx
│
├── 📁 backend/                  # API Node.js
│   ├── server.js               # Serveur Express
│   ├── test-connection.js      # Test de connexion Azure
│   ├── package.json            # Dépendances
│   ├── .env.example            # Template configuration
│   └── Dockerfile              # Image Docker
│
├── 📁 frontend/                 # Interface web
│   ├── index.html              # Page principale
│   ├── app.js                  # Logique JavaScript
│   └── styles.css              # Styles CSS
│
├── 📁 docs/                     # Documentation
│   ├── AZURE_SETUP.md          # Configuration Azure
│   ├── GETTING_STARTED.md      # Guide de démarrage
│   └── CUSTOMIZATION.md        # Guide de personnalisation
│
└── 📁 scripts/                  # Scripts utilitaires
    ├── start-dev.sh            # Démarrer en dev
    └── stop-dev.sh             # Arrêter l'application
```

## 🎓 Apprendre par l'exemple

### Exemple 1 : Upload simple

```javascript
// Frontend - app.js
const formData = new FormData();
formData.append('file', file);

const response = await fetch('http://localhost:3000/api/upload', {
  method: 'POST',
  body: formData
});
```

### Exemple 2 : Lister les fichiers

```javascript
// Frontend - app.js
const response = await fetch('http://localhost:3000/api/files');
const data = await response.json();
console.log(`${data.count} fichiers trouvés`);
```

### Exemple 3 : Configuration backend

```javascript
// Backend - server.js
const containerName = process.env.AZURE_CONTAINER_NAME || 'uploads';
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
```

## 🔧 Configuration Minimale

Seule variable **obligatoire** dans `backend/.env` :

```env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
```

Tout le reste a des valeurs par défaut sensées.

## 🐳 Déploiement Production

### Option Docker (Recommandée)

```bash
# 1. Créer .env à la racine
cat > .env << EOF
AZURE_STORAGE_CONNECTION_STRING=votre_connection_string
EOF

# 2. Lancer avec Docker Compose
docker-compose up -d

# 3. Vérifier
curl http://localhost:3000/api/health
```

### Option Infrastructure Azure avec Terraform

```bash
# Créer les ressources Azure Storage
cd infrastructure
terraform init
terraform plan
terraform apply

# Récupérer la chaîne de connexion
terraform output -raw storage_account_primary_connection_string
```

Voir [infrastructure/README.md](../infrastructure/README.md) pour plus de détails sur la configuration.

## 🛠️ Développement

### Commandes utiles

```bash
# Tester la connexion Azure
cd backend
node test-connection.js

# Démarrer en mode dev (auto-reload)
npm run dev

# Voir les logs en temps réel
docker-compose logs -f

# Arrêter tout
./scripts/stop-dev.sh
# ou
docker-compose down
```

### API Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Santé du serveur |
| POST | `/api/container/init` | Créer le conteneur |
| POST | `/api/upload` | Upload un fichier |
| POST | `/api/upload/multiple` | Upload plusieurs fichiers |
| GET | `/api/files` | Lister les fichiers |
| GET | `/api/download/:blobName` | Télécharger un fichier |
| DELETE | `/api/files/:blobName` | Supprimer un fichier |

## 🔒 Sécurité

ShareAzure intègre :
- ✅ Rate limiting (100 req/15min)
- ✅ Helmet.js (headers de sécurité)
- ✅ CORS configuré
- ✅ Validation des fichiers
- ✅ Limite de taille
- ✅ Noms uniques (UUID)

Pour la production, pensez à :
- 🔐 Activer HTTPS
- 👤 Ajouter l'authentification
- 📊 Configurer Application Insights
- 🔥 Configurer un firewall Azure

## 💰 Coûts estimés

Pour 100 GB de stockage + 1M transactions/mois :

| Service | Coût mensuel |
|---------|--------------|
| Stockage (100 GB) | ~1.80 € |
| Transactions (1M) | ~0.40 € |
| Logs (10 GB) | ~11.50 € |
| **Total** | **~14 €** |

## 🆘 Aide et Support

### Problèmes courants

**1. Erreur de connexion Azure**
```bash
# Vérifier la connection string
node backend/test-connection.js
```

**2. Port déjà utilisé**
```bash
# Changer le port
PORT=3001 npm start
```

**3. CORS error**
```env
# Ajouter l'origine dans .env
ALLOWED_ORIGINS=http://localhost:8080
```

### Ressources

- 📖 [Documentation Azure Storage](https://docs.microsoft.com/azure/storage/)
- 💬 [Issues GitHub](https://github.com/votre-repo/issues)
- 📧 Contact : votre-email@april.fr

## 🎯 Prochaines Étapes

Maintenant que vous avez ShareAzure qui fonctionne :

1. ✅ **Tester** - Uploadez quelques fichiers pour vous familiariser
2. 📖 **Explorer** - Lisez [CUSTOMIZATION.md](CUSTOMIZATION.md) pour personnaliser
3. 🔒 **Sécuriser** - Suivez [AZURE_SETUP.md](AZURE_SETUP.md) pour la production
4. 📈 **Monitor** - Configurez Application Insights
5. 🚀 **Déployer** - Mettez en production avec Docker

## 🌟 Améliorations Futures

Idées d'évolution :
- [ ] Authentification Azure AD B2C
- [ ] Preview d'images et PDFs
- [ ] Recherche et filtres avancés
- [ ] Partage de fichiers avec liens temporaires
- [ ] Compression automatique d'images
- [ ] Versioning de fichiers
- [ ] Interface d'administration
- [ ] API REST complète

## 🙏 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- 🐛 Reporter des bugs
- 💡 Proposer des améliorations
- 📝 Améliorer la documentation
- 🔧 Soumettre des pull requests

---

**Prêt à commencer ?** Lancez `./scripts/start-dev.sh` et c'est parti ! 🚀

Questions ? Consultez la [documentation complète](README.md) ou contactez l'équipe STTI.

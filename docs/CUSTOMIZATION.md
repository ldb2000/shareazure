# 🎨 Guide de Personnalisation

Ce guide vous explique comment personnaliser ShareAzure pour vos besoins spécifiques.

## 🎯 Cas d'Usage Courants

### 1. Restreindre les types de fichiers acceptés

**Backend** (`server.js`) :

```javascript
// Modifier le fileFilter de multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les images et PDFs
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
    }
  }
});
```

### 2. Organiser les fichiers par dossiers/dates

**Backend** (`server.js`) - Modifier la route upload :

```javascript
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    // Créer un chemin avec date
    const today = new Date();
    const folder = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    const fileExtension = req.file.originalname.split('.').pop();
    const blobName = `${folder}/${uuidv4()}.${fileExtension}`;
    
    // ... reste du code
  }
});
```

### 3. Ajouter une authentification simple

**Backend** - Ajouter un middleware :

```javascript
// Middleware d'authentification
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token === process.env.API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
  }
};

// Protéger les routes
app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
  // ...
});
```

**Frontend** (`app.js`) - Ajouter le token :

```javascript
const API_KEY = 'votre-clé-secrète'; // À stocker de manière sécurisée

fetch(`${API_URL}/upload`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  },
  body: formData
});
```

### 4. Compression automatique d'images

**Backend** - Installer Sharp :

```bash
npm install sharp
```

```javascript
const sharp = require('sharp');

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let buffer = req.file.buffer;
    
    // Compresser si c'est une image
    if (req.file.mimetype.startsWith('image/')) {
      buffer = await sharp(buffer)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }
    
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype }
    });
    
    // ...
  }
});
```

### 5. Partage de fichiers avec liens temporaires (SAS)

**Backend** - Nouvelle route :

```javascript
const { generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

app.get('/api/share/:blobName', async (req, res) => {
  try {
    const { blobName } = req.params;
    const { expiresIn = 3600 } = req.query; // 1 heure par défaut
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);
    
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'), // lecture seule
      startsOn,
      expiresOn
    }, blobServiceClient.credential).toString();
    
    const sasUrl = `${blockBlobClient.url}?${sasToken}`;
    
    res.json({
      success: true,
      url: sasUrl,
      expiresAt: expiresOn
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 6. Preview d'images dans l'interface

**Frontend** (`app.js`) :

```javascript
function displayFiles(files) {
  filesList.innerHTML = '';

  files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    // Générer une preview pour les images
    let preview = getFileIcon(file.contentType);
    if (file.contentType?.startsWith('image/')) {
      // Demander un lien SAS temporaire
      fetch(`${API_URL}/share/${file.name}?expiresIn=300`)
        .then(r => r.json())
        .then(data => {
          preview = `<img src="${data.url}" style="max-width: 100px; max-height: 100px;">`;
          fileItem.querySelector('.file-icon').innerHTML = preview;
        });
    }
    
    fileItem.innerHTML = `
      <div class="file-info">
        <div class="file-icon">${preview}</div>
        <!-- ... -->
      </div>
    `;
    filesList.appendChild(fileItem);
  });
}
```

### 7. Notifications Email après upload

**Backend** - Installer Nodemailer :

```bash
npm install nodemailer
```

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Après upload réussi
await transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: 'admin@example.com',
  subject: 'Nouveau fichier uploadé',
  html: `
    <h2>Nouveau fichier uploadé</h2>
    <p>Nom: ${req.file.originalname}</p>
    <p>Taille: ${req.file.size} bytes</p>
    <p>Date: ${new Date().toLocaleString()}</p>
  `
});
```

### 8. Scan antivirus avec Azure Defender

**Backend** :

```javascript
const { DefaultAzureCredential } = require('@azure/identity');
const { SecurityCenter } = require('@azure/arm-security');

// Après upload
const credential = new DefaultAzureCredential();
const client = new SecurityCenter(credential, subscriptionId);

// Déclencher un scan
await client.malwareScanning.scan({
  resourceUri: blockBlobClient.url
});
```

### 9. Statistiques d'utilisation

**Backend** - Ajouter une route de stats :

```javascript
app.get('/api/stats', async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    let totalSize = 0;
    let fileCount = 0;
    const fileTypes = {};
    
    for await (const blob of containerClient.listBlobsFlat()) {
      totalSize += blob.properties.contentLength;
      fileCount++;
      
      const ext = blob.name.split('.').pop();
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    }
    
    res.json({
      success: true,
      stats: {
        totalFiles: fileCount,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileTypes
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 10. Recherche de fichiers

**Backend** :

```javascript
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const results = [];
    
    for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
      const originalName = blob.metadata?.originalName || blob.name;
      
      if (originalName.toLowerCase().includes(q.toLowerCase())) {
        results.push({
          name: blob.name,
          originalName,
          size: blob.properties.contentLength,
          lastModified: blob.properties.lastModified
        });
      }
    }
    
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Frontend** - Ajouter une barre de recherche :

```html
<div class="search-bar">
  <input type="text" id="searchInput" placeholder="Rechercher un fichier...">
  <button onclick="searchFiles()">🔍 Rechercher</button>
</div>
```

```javascript
async function searchFiles() {
  const query = document.getElementById('searchInput').value;
  if (!query) return;
  
  const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  
  if (data.success) {
    displayFiles(data.results);
  }
}
```

## 🎨 Personnalisation du Style

### Changer les couleurs principales

**Frontend** (`styles.css`) :

```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --success-color: #4CAF50;
  --danger-color: #f44336;
  --text-color: #333;
}

/* Remplacer les couleurs en dur par les variables */
.btn-primary {
  background: var(--primary-color);
}
```

### Mode sombre

**Frontend** (`styles.css`) :

```css
@media (prefers-color-scheme: dark) {
  body {
    background: #1a1a1a;
  }
  
  .container {
    background: #2d2d2d;
    color: #ffffff;
  }
  
  .upload-area {
    background: #3d3d3d;
    border-color: #667eea;
  }
}
```

## 🔧 Optimisations

### Cache Redis pour les métadonnées

```bash
npm install redis
```

```javascript
const redis = require('redis');
const client = redis.createClient();

// Cache la liste des fichiers pendant 5 minutes
app.get('/api/files', async (req, res) => {
  const cacheKey = 'files:list';
  
  // Vérifier le cache
  const cached = await client.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Récupérer depuis Azure
  const files = await listFiles();
  
  // Mettre en cache
  await client.setEx(cacheKey, 300, JSON.stringify(files));
  
  res.json(files);
});
```

### CDN pour les fichiers statiques

Configurez Azure CDN devant votre Blob Storage pour améliorer les performances.

## 🚀 Déploiement

### Variables d'environnement en production

```env
# Production
NODE_ENV=production
AZURE_STORAGE_CONNECTION_STRING=...
ALLOWED_ORIGINS=https://votre-domaine.com
MAX_FILE_SIZE_MB=50
APPLICATIONINSIGHTS_CONNECTION_STRING=...

# Authentification (si activée)
API_KEY=une-cle-tres-secrete

# Email (si activé)
EMAIL_USER=notifications@example.com
EMAIL_PASSWORD=...
```

### CI/CD avec GitHub Actions

`.github/workflows/deploy.yml` :

```yaml
name: Deploy ShareAzure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Login to Azure
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Build Docker images
        run: |
          docker build -t shareazure-backend ./backend
          docker build -t shareazure-frontend -f ./frontend/Dockerfile ./frontend
      
      - name: Deploy infrastructure with Terraform
        run: |
          cd infrastructure
          terraform init
          terraform apply -auto-approve
      
      # Note: Adaptez cette étape selon votre plateforme de déploiement Docker
      # (Azure Container Instances, AKS, ou autre)
      - name: Deploy containers
        run: |
          # Exemple pour Azure Container Instances ou autre service Docker
          # az container create --resource-group rg-shareazure ...
```

## 📚 Ressources

- [Azure Blob Storage SDK](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/storage/storage-blob)
- [Express.js Documentation](https://expressjs.com/)
- [Multer Documentation](https://github.com/expressjs/multer)
- [Sharp (Image Processing)](https://sharp.pixelplumbing.com/)

Besoin d'aide ? Consultez les issues sur GitHub ou contactez l'équipe STTI !

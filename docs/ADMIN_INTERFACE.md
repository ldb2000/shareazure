# 🎛️ Interface d'Administration ShareAzure

## 📋 Vue d'ensemble

L'interface d'administration de ShareAzure offre une gestion complète et centralisée de tous les aspects de l'application : fichiers, partages, utilisateurs, logs et paramètres.

## 🚀 Accès à l'Interface

### URL
```
http://localhost:8080/admin/
```

### Authentification
Pour l'instant, l'interface est accessible sans authentification. En production, il est **fortement recommandé** d'ajouter Azure AD B2C.

## 📊 Sections de l'Interface

### 1. Dashboard

Le tableau de bord offre une vue d'ensemble de l'activité :

#### Cartes de Statistiques
- **Total Fichiers** : Nombre total de fichiers uploadés
- **Stockage Utilisé** : Espace de stockage consommé / disponible
- **Liens Actifs** : Nombre de liens de partage actifs
- **Téléchargements** : Statistiques de téléchargement

#### Graphiques
- **Uploads par jour** : Graphique linéaire des 7 derniers jours
- **Types de fichiers** : Répartition par catégorie (images, PDFs, etc.)

#### Activité Récente
- Liste des 10 dernières opérations
- Horodatage et détails de chaque action

### 2. Gestion des Fichiers

Interface complète de gestion des fichiers uploadés.

#### Fonctionnalités

**🔍 Recherche et Filtres**
- Recherche par nom de fichier
- Filtre par type (images, PDF, vidéos, audio, documents)
- Tri par date, taille ou nom

**📋 Vue Tableau**
- Liste complète avec colonnes :
  - Nom du fichier avec icône
  - Type de fichier
  - Taille
  - Date d'upload
  - Nombre de partages
  - Actions disponibles

**✅ Sélection Multiple**
- Case à cocher pour sélectionner tous les fichiers
- Suppression en masse

**👁️ Détails de Fichier**
- Modal avec informations complètes
- Prévisualisation
- Téléchargement direct

#### Actions Disponibles

```javascript
// Voir les détails
viewFileDetails(blobName)

// Télécharger
downloadFile(blobName)

// Supprimer
deleteFile(blobName)

// Suppression multiple
deleteSelectedFiles()
```

### 3. Gestion des Partages

Historique complet de tous les liens de partage générés.

#### Tableau des Partages

Colonnes affichées :
- **Fichier** : Nom du fichier partagé
- **Créé le** : Date de création du lien
- **Expire le** : Date d'expiration
- **Statut** : Actif ou Expiré
- **Téléchargements** : Nombre de fois téléchargé
- **Actions** : Copier le lien

#### Filtres

- Recherche par nom de fichier
- Filtre par statut (actif/expiré)

#### Export

```javascript
// Exporter en CSV
exportSharesCSV()
```

Format du CSV :
```csv
Fichier,Créé le,Expire le,Statut,Téléchargements
document.pdf,2025-01-07T10:00:00Z,2025-01-08T10:00:00Z,active,5
```

### 4. Gestion des Utilisateurs

**🔐 Note importante** : Cette section nécessite Azure AD B2C pour fonctionner.

Fonctionnalités prévues :
- Liste des utilisateurs
- Permissions et rôles
- Activité par utilisateur
- Gestion des accès

### 5. Logs Système

Vue complète de tous les logs d'opérations.

#### Types de Logs

- **Info** : Opérations normales (upload, download)
- **Warning** : Avertissements (quota proche, etc.)
- **Error** : Erreurs système

#### Filtres

```javascript
// Par niveau
logLevelFilter: ['info', 'warning', 'error']

// Par opération
logOperationFilter: ['upload', 'download', 'delete', 'share']
```

#### Actions

- **Effacer les logs** : Supprime tous les logs
- **Exporter** : Télécharge les logs en .txt

Format d'export :
```
[2025-01-07T10:00:00Z] INFO - upload: File uploaded successfully
[2025-01-07T10:05:00Z] WARNING - quota: Storage quota at 80%
[2025-01-07T10:10:00Z] ERROR - delete: File not found
```

### 6. Paramètres

Configuration complète de l'application.

#### Configuration du Stockage

```javascript
{
  maxFileSizeMB: 100,        // Taille max par fichier
  containerName: 'uploads',   // Nom du conteneur Azure
  storageQuota: 100          // Quota total en GB
}
```

#### Configuration du Partage

```javascript
{
  maxShareDays: 30,              // Durée max d'expiration
  defaultShareMinutes: 60,       // Durée par défaut
  requirePassword: false         // Exiger mot de passe
}
```

#### Sécurité

```javascript
{
  rateLimit: 100,               // Requêtes par 15 min
  enableLogs: true,             // Logs détaillés
  enableAudit: true             // Audit trail
}
```

#### Notifications

```javascript
{
  notifyUploads: false,         // Notif nouveaux uploads
  notifyShares: false,          // Notif nouveaux partages
  notifyQuota: true             // Alerte quota dépassé
}
```

#### Sauvegarde

```javascript
// Enregistrer les paramètres
saveSettings()

// Réinitialiser aux valeurs par défaut
resetSettings()
```

## 🎨 Interface Utilisateur

### Design System

#### Couleurs
```css
--primary-color: #6366f1     /* Violet principal */
--success-color: #10b981     /* Vert succès */
--danger-color: #ef4444      /* Rouge danger */
--warning-color: #f59e0b     /* Orange warning */
```

#### Layout
- **Sidebar fixe** : 260px de largeur
- **Header sticky** : 70px de hauteur
- **Content responsive** : Grid adaptatif

### Navigation

#### Sidebar
```
📦 ShareAzure
━━━━━━━━━━━━━
📊 Dashboard
📁 Fichiers
🔗 Partages
👥 Utilisateurs
📋 Logs
⚙️ Paramètres
```

#### Actions Rapides
- 🔄 Rafraîchir
- 🔔 Notifications
- 👤 Profil utilisateur

## 💻 Développement

### Structure des Fichiers

```
admin/
├── index.html           # Page principale
├── css/
│   └── admin.css       # Styles complets
└── js/
    └── admin.js        # Logique complète
```

### API Endpoints Utilisés

```javascript
// Fichiers
GET    /api/files              // Liste des fichiers
DELETE /api/files/:blobName    // Supprimer un fichier
GET    /api/download/:blobName // Télécharger
GET    /api/preview/:blobName  // Aperçu

// Santé
GET    /api/health             // Health check
```

### Fonctions Principales

```javascript
// Navigation
switchSection(section)
loadSectionData(section)

// Dashboard
loadDashboard()
calculateStats(files)
createUploadsChart(data)
createFileTypesChart(data)

// Fichiers
loadFiles()
renderFilesTable(files)
filterFiles()
sortFiles()
deleteFile(blobName)

// Partages
loadShares()
renderSharesTable(shares)
exportSharesCSV()

// Logs
loadLogs()
renderLogs(logs)
filterLogs()
exportLogs()

// Paramètres
saveSettings()
resetSettings()

// Utilitaires
formatBytes(bytes)
formatTimeAgo(date)
showNotification(message, type)
```

## 🔧 Personnalisation

### Modifier les Couleurs

Dans `admin.css` :

```css
:root {
    --primary-color: #votre-couleur;
    --primary-dark: #votre-couleur-foncée;
}
```

### Ajouter une Section

1. **HTML** - Ajouter dans `index.html` :
```html
<a href="#nouvelle-section" class="nav-item" data-section="nouvelle-section">
    <span class="nav-icon">🆕</span>
    <span class="nav-text">Nouvelle Section</span>
</a>

<section id="nouvelle-section" class="content-section">
    <!-- Contenu ici -->
</section>
```

2. **JavaScript** - Ajouter dans `admin.js` :
```javascript
const titles = {
    // ... autres sections
    'nouvelle-section': { 
        title: 'Nouvelle Section', 
        subtitle: 'Description' 
    }
};

function loadSectionData(section) {
    switch(section) {
        // ... autres cases
        case 'nouvelle-section':
            loadNouvelleSection();
            break;
    }
}
```

### Modifier les Statistiques

Dans `calculateStats()` :

```javascript
function calculateStats(files) {
    return {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        // Ajoutez vos propres stats
        customStat: calculateCustomStat(files)
    };
}
```

## 📱 Responsive Design

### Breakpoints

```css
/* Tablettes */
@media (max-width: 1024px) {
    .sidebar { transform: translateX(-100%); }
    .main-content { margin-left: 0; }
}

/* Mobiles */
@media (max-width: 768px) {
    .stats-grid { grid-template-columns: 1fr; }
    .charts-row { grid-template-columns: 1fr; }
}
```

### Menu Mobile

Pour ajouter un bouton hamburger :

```html
<button id="menuToggle" class="mobile-menu-btn">
    ☰
</button>
```

```javascript
document.getElementById('menuToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
});
```

## 🔐 Sécurité

### Production Checklist

- [ ] **Ajouter authentification** : Azure AD B2C
- [ ] **Activer HTTPS** : Certificat SSL
- [ ] **Configurer CORS** : Limiter les origines
- [ ] **Rate limiting** : Protection API
- [ ] **Logs d'audit** : Traçabilité complète
- [ ] **Validation des entrées** : Côté client et serveur

### Authentification Azure AD

Pour ajouter Azure AD B2C :

```javascript
// Dans admin.js
import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
    auth: {
        clientId: "votre-client-id",
        authority: "https://votre-tenant.b2clogin.com/...",
        redirectUri: "http://localhost:8080/admin/"
    }
};

const msalInstance = new PublicClientApplication(msalConfig);

// Login
async function login() {
    await msalInstance.loginPopup();
}

// Vérifier l'authentification
if (!msalInstance.getAllAccounts().length) {
    login();
}
```

## 🧪 Tests

### Test Manuel

1. **Dashboard**
   - Vérifier que les statistiques se chargent
   - Vérifier que les graphiques s'affichent
   - Vérifier l'activité récente

2. **Fichiers**
   - Upload un fichier via l'interface principale
   - Vérifier qu'il apparaît dans l'admin
   - Tester la recherche et les filtres
   - Tester le tri
   - Tester la suppression

3. **Partages**
   - Générer un lien de partage
   - Vérifier qu'il apparaît dans l'historique
   - Tester les filtres

4. **Logs**
   - Vérifier que les logs s'affichent
   - Tester les filtres
   - Tester l'export

5. **Paramètres**
   - Modifier des valeurs
   - Enregistrer
   - Vérifier la persistance

### Tests Automatisés

À implémenter avec Jest/Cypress :

```javascript
describe('Admin Interface', () => {
    it('should load dashboard stats', async () => {
        const stats = await loadDashboard();
        expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    });
    
    it('should filter files by type', () => {
        // Test du filtrage
    });
});
```

## 📈 Améliorations Futures

### Court Terme
- [ ] Authentification complète
- [ ] API backend pour l'historique des partages
- [ ] Export Excel en plus du CSV
- [ ] Notifications push

### Moyen Terme
- [ ] Dashboard personnalisable
- [ ] Rapports planifiés
- [ ] Webhooks
- [ ] API REST complète

### Long Terme
- [ ] Application mobile admin
- [ ] Machine Learning pour détection d'anomalies
- [ ] Intégration Power BI
- [ ] Multi-tenancy

## 🆘 Dépannage

### Problème : Les stats ne se chargent pas

**Cause** : API backend non accessible

**Solution** :
```bash
# Vérifier que le backend tourne
curl http://localhost:3000/api/health

# Démarrer le backend
cd backend && npm start
```

### Problème : Les graphiques ne s'affichent pas

**Cause** : Chart.js non chargé

**Solution** :
Vérifier que le CDN est accessible dans `index.html` :
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

### Problème : Erreur CORS

**Cause** : CORS mal configuré

**Solution** :
Dans `backend/.env` :
```env
ALLOWED_ORIGINS=http://localhost:8080
```

## 📞 Support

### Documentation Connexe
- [README.md](../README.md) - Documentation principale
- [GETTING_STARTED.md](GETTING_STARTED.md) - Guide de démarrage
- [SHARE_FEATURE.md](SHARE_FEATURE.md) - Fonctionnalité de partage

### Contact
Pour toute question : laurent.deberti@april.fr

---

**Développé pour APRIL/STTI**  
*Janvier 2025*

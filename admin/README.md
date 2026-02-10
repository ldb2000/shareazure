# 🎛️ ShareAzure - Interface d'Administration

Interface d'administration complète pour gérer ShareAzure avec dashboard, statistiques, gestion des fichiers, historique des partages, logs et paramètres.

## 🚀 Accès Rapide

```bash
# Démarrer avec le script automatique
./scripts/start-admin.sh

# Puis ouvrir dans le navigateur
http://localhost:8080/admin/
```

## 📊 Fonctionnalités

### Dashboard
- 📈 Statistiques en temps réel (fichiers, stockage, partages, téléchargements)
- 📊 Graphiques interactifs (uploads par jour, types de fichiers)
- 🕒 Activité récente

### Gestion des Fichiers
- 🔍 Recherche en temps réel
- 📑 Filtres par type
- ⬆️⬇️ Tri multi-critères
- ✅ Actions en masse
- 👁️ Détails complets

### Historique des Partages
- 📋 Tous les liens générés
- 🔍 Recherche et filtres
- 📥 Export CSV
- 📊 Statistiques de téléchargement

### Logs Système
- 📜 Tous les logs
- 🎚️ Filtres par niveau et opération
- 📤 Export
- 🗑️ Nettoyage

### Paramètres
- 💾 Configuration du stockage
- 🔗 Configuration du partage
- 🔒 Sécurité
- 🔔 Notifications

## 📁 Structure

```
admin/
├── index.html          # Page principale (520 lignes)
├── css/
│   └── admin.css      # Styles (850+ lignes)
│       ├── Variables CSS
│       ├── Layout (sidebar + main)
│       ├── Composants
│       ├── Charts
│       └── Responsive
└── js/
    └── admin.js       # Logique (750+ lignes)
        ├── Navigation
        ├── Dashboard
        ├── Files management
        ├── Shares management
        ├── Logs management
        ├── Settings
        └── Utilities
```

## 🎨 Design System

### Couleurs
```css
--primary-color: #6366f1   /* Violet principal */
--success-color: #10b981   /* Vert succès */
--danger-color: #ef4444    /* Rouge danger */
--warning-color: #f59e0b   /* Orange warning */
--info-color: #3b82f6      /* Bleu information */
```

### Layout
- **Sidebar fixe** : 260px
- **Header sticky** : 70px
- **Content responsive** : Grid adaptatif

## 🔧 Technologies

- **HTML5** - Structure sémantique
- **CSS3** - Variables, Grid, Flexbox, Animations
- **JavaScript Vanilla** - ES6+, Async/Await
- **Chart.js** - Graphiques interactifs
- **Fetch API** - Communication avec le backend

## 📚 Documentation

- **[ADMIN_INTERFACE.md](../docs/ADMIN_INTERFACE.md)** - Documentation complète
- **[GETTING_STARTED.md](../docs/GETTING_STARTED.md)** - Guide de démarrage

## 🔐 Sécurité

### Pour le Développement
✅ Accessible sans authentification

### Pour la Production
⚠️ **IMPORTANT** : Ajouter Azure AD B2C

```javascript
// Exemple d'intégration MSAL
import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
    auth: {
        clientId: "your-client-id",
        authority: "https://your-tenant.b2clogin.com/...",
        redirectUri: window.location.origin + "/admin/"
    }
};
```

## 🧪 Test Local

1. **Démarrer le backend**
```bash
cd backend && npm start
```

2. **Démarrer le frontend**
```bash
cd frontend && python3 -m http.server 8080
```

3. **Ouvrir l'admin**
```
http://localhost:8080/admin/
```

## 🎯 Cas d'Usage

### Monitoring quotidien
1. Ouvrir le Dashboard
2. Vérifier les statistiques
3. Consulter l'activité récente

### Gestion des fichiers
1. Aller dans Fichiers
2. Rechercher/filtrer
3. Actions (voir, supprimer)

### Audit des partages
1. Aller dans Partages
2. Filtrer par statut
3. Exporter l'historique

### Configuration
1. Aller dans Paramètres
2. Modifier les valeurs
3. Enregistrer

## 🐛 Dépannage

### Les stats ne se chargent pas
```bash
# Vérifier le backend
curl http://localhost:3000/api/health
```

### Graphiques vides
Vérifier que Chart.js est chargé :
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

### CORS Error
Dans `backend/.env` :
```env
ALLOWED_ORIGINS=http://localhost:8080
```

## 📈 Roadmap

### v2.1 (Court terme)
- [ ] Authentification Azure AD B2C
- [ ] API backend pour historique des partages
- [ ] Pagination des tableaux
- [ ] Dark mode

### v2.2 (Moyen terme)
- [ ] Dashboard personnalisable
- [ ] Exports Excel
- [ ] Notifications push
- [ ] Webhooks

### v3.0 (Long terme)
- [ ] Multi-tenancy
- [ ] Rapports automatiques
- [ ] Machine Learning
- [ ] Application mobile admin

## 👤 Développé pour

**APRIL - STTI**  
*Janvier 2025*

## 📧 Contact

Laurent Deberti  
laurent.deberti@april.fr

---

## ⚡ Quick Commands

```bash
# Démarrer tout
./scripts/start-admin.sh

# Accéder à l'admin
open http://localhost:8080/admin/

# Logs backend
cd backend && npm start

# Arrêter
Ctrl+C
```

## 🎉 Enjoy!

L'interface d'administration rend ShareAzure encore plus puissant et facile à gérer !

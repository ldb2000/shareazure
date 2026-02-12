# Changelog

Toutes les modifications notables de ShareAzure seront documentées dans ce fichier.

## [3.1.0] - 2026-02-12

### Section "Decouvrir" (Dashboard Utilisateur)

Expose les fonctionnalites IA aux utilisateurs via une nouvelle section dans le dashboard.

#### Nouvelles fonctionnalites

- **Bouton Decouvrir** : nouveau bouton boussole dans le header utilisateur
- **Onglet Par Tags** : nuage de tags dimensionne par frequence, clic sur un tag pour voir les fichiers associes
- **Onglet Recherche IA** : recherche semantique avec suggestions autocomplete (debounce 300ms), filtre par type de fichier, resultats en grille
- **Onglet Carte** : carte Leaflet.js avec MarkerCluster pour les fichiers geotagues, popups avec nom/ville/pays/coordonnees
- **Navigation exclusive** : les sections Fichiers, Partages, Equipe et Decouvrir sont mutuellement exclusives
- **Gestion d'erreur gracieuse** : messages clairs si les APIs IA ne sont pas activees

#### Fichiers modifies

- `frontend/user.html` : CDN Leaflet/MarkerCluster, bouton header, section HTML complete
- `frontend/css/user.css` : ~150 lignes de styles (tabs, tag cloud, grille, carte, responsive)
- `frontend/js/user.js` : ~250 lignes (12 fonctions, event listeners, modifications navigation)

#### Documentation

- **[docs/AI_FEATURES.md](docs/AI_FEATURES.md)** : nouvelle documentation complete des fonctionnalites IA et de la section Decouvrir

#### Notes

- Aucun changement backend : toutes les APIs necessaires existaient deja (`/api/ai/tags`, `/api/ai/search`, `/api/ai/map`)
- 257 tests passent sans regression

## [2.1.0] - 2025-01-12

### 🔒 Sécurité et Améliorations du Partage

#### Sécurité Renforcée
- ✅ **Protection du mot de passe** : Le mot de passe n'apparaît plus dans l'URL lors du téléchargement
- ✅ **Formulaire sécurisé** : Utilisation de `type="button"` et `onsubmit="return false;"` pour empêcher la soumission par défaut
- ✅ **Validation côté client** : Vérification que le mot de passe est fourni avant l'envoi

#### Partage Ciblé par Email
- ✅ **Email obligatoire** : Le champ email est maintenant obligatoire lors de la création d'un lien de partage
- ✅ **Support de plusieurs emails** : Possibilité d'entrer plusieurs emails séparés par des virgules (ex: `email1@example.com, email2@example.com`)
- ✅ **Validation des emails** : Vérification du format de chaque email
- ✅ **Stockage des emails** : Les emails des destinataires sont stockés dans la base de données

#### Gestion des Domaines Autorisés
- ✅ **Table des domaines autorisés** : Nouvelle table `allowed_email_domains` dans la base de données
- ✅ **Interface admin** : Section dédiée dans l'interface admin pour gérer les domaines autorisés
- ✅ **API de gestion** : Routes admin pour ajouter, supprimer, activer/désactiver des domaines
- ✅ **Validation automatique** : Vérification que le domaine de l'email est autorisé lors de la création d'un lien
- ✅ **Messages d'erreur clairs** : Indication précise des domaines non autorisés

#### Améliorations de l'Interface
- ✅ **Page de téléchargement simplifiée** : Affichage uniquement du nom du fichier (taille retirée)
- ✅ **Messages d'erreur améliorés** : Message clair "❌ Mot de passe incorrect. Veuillez réessayer."
- ✅ **Logo APRIL** : Le logo est maintenant servi depuis le backend via `/api/logo-april.svg`
- ✅ **Focus automatique** : Le champ mot de passe reprend le focus après une erreur

#### Base de Données
- ✅ **Migration automatique** : Ajout automatique de la colonne `recipient_email` si elle n'existe pas
- ✅ **Nouvelle table** : Table `allowed_email_domains` pour gérer les domaines autorisés

### 🔧 Corrections Techniques
- ✅ Correction de l'affichage du logo APRIL sur la page de téléchargement
- ✅ Amélioration de la gestion des erreurs dans le formulaire de téléchargement
- ✅ Nettoyage automatique des éléments DOM après téléchargement

## [2.0.0] - 2025-01-07

### 🎛️ Ajout Majeur : Interface d'Administration

#### Nouvelles Fonctionnalités

**Dashboard Complet**
- ✨ Tableau de bord avec 4 cartes de statistiques en temps réel
- 📊 Graphique des uploads par jour (7 derniers jours) avec Chart.js
- 🎨 Graphique camembert des types de fichiers
- 🕒 Activité récente (10 dernières opérations)

**Gestion Avancée des Fichiers**
- 🔍 Recherche en temps réel par nom de fichier
- 📑 Filtres par type (Images, PDF, Vidéos, Audio, Documents, Autres)
- ⬆️⬇️ Tri multi-critères (date, taille, nom)
- ✅ Sélection multiple avec actions en masse
- 👁️ Modal de détails complet pour chaque fichier
- 🗑️ Suppression individuelle ou en masse
- 📊 Statistiques par fichier

**Historique des Partages**
- 📋 Tableau complet de tous les liens générés
- 🔍 Recherche par nom de fichier
- 📊 Filtres par statut (Actif/Expiré)
- 📥 Export en CSV
- 📈 Compteur de téléchargements par lien
- 🕐 Dates de création et expiration

**Logs Système**
- 📜 Visualisation de tous les logs d'opérations
- 🎚️ Filtres par niveau (Info, Warning, Error)
- 🔧 Filtres par opération (Upload, Download, Delete, Share)
- 📤 Export des logs en .txt
- 🗑️ Fonction de nettoyage des logs
- 🎨 Coloration syntaxique par niveau

**Paramètres Configurables**
- 💾 Configuration du stockage (taille max, quota)
- 🔗 Configuration du partage (durées, mot de passe)
- 🔒 Paramètres de sécurité (rate limiting, logs, audit)
- 🔔 Notifications configurables
- 💾 Sauvegarde des préférences en localStorage
- 🔄 Réinitialisation aux valeurs par défaut

#### Interface Utilisateur

**Design System**
- 🎨 Design moderne avec palette de couleurs cohérente
- 📱 Responsive design (desktop, tablette, mobile)
- 🎭 Animations fluides et transitions
- 🌈 Thème violet avec dégradés
- 📐 Layout avec sidebar fixe et contenu scrollable

**Navigation**
- 🧭 Sidebar avec 6 sections principales
- 🔗 Navigation par onglets
- 📍 Indicateur de section active
- ⌨️ Support du clavier (Escape pour fermer modals)

**Composants**
- 📊 Cartes de statistiques avec icônes
- 📈 Graphiques interactifs (Chart.js)
- 📋 Tableaux de données avec tri et pagination
- 🔍 Barre de recherche en temps réel
- 🎛️ Filtres et sélecteurs
- 🔘 Système de boutons cohérent
- 🔔 Notifications toast
- 📱 Modals pour actions importantes

#### Documentation

- 📖 [ADMIN_INTERFACE.md](docs/ADMIN_INTERFACE.md) - Documentation complète
- 🚀 [ADMIN_INTERFACE.md](docs/ADMIN_INTERFACE.md) - Documentation admin complète
- 📝 README.md mis à jour avec section admin

#### Fichiers Ajoutés

```
admin/
├── index.html          # Interface principale (520 lignes)
├── css/
│   └── admin.css      # Styles complets (850+ lignes)
└── js/
    └── admin.js       # Logique complète (750+ lignes)
```

#### Améliorations Techniques

- ⚡ Chargement asynchrone des données
- 🎯 Gestion d'état centralisée
- 🔄 Mise à jour en temps réel
- 📊 Calculs de statistiques côté client
- 🎨 Animations CSS performantes
- 📱 Media queries pour responsive
- 🔧 Modularité du code JavaScript

### 🔗 Améliorations du Partage

- 📱 QR Code généré automatiquement (déjà présent en v2.0 frontend)
- 🔒 Protection par mot de passe optionnelle (interface déjà présente)
- 📊 Compteur de téléchargements (prévu pour backend)

### 📚 Documentation

- ✨ Documentation admin complète
- 🚀 Guide de démarrage rapide admin
- 📝 README mis à jour
- 🔄 CHANGELOG structuré

### 🐛 Corrections

- Aucune correction dans cette version (nouvelle fonctionnalité)

### ⚠️ Notes de Migration

**Depuis v1.x vers v2.0 :**
- Aucun changement breaking
- L'interface admin est additive
- Toutes les fonctionnalités v1.x sont préservées
- Accès direct via `/admin/`

**Configuration requise :**
- Même configuration qu'en v1.x
- Aucune dépendance backend supplémentaire requise
- Chart.js chargé via CDN


Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.0.0] - 2025-01-07

### 🎉 Nouvelles fonctionnalités majeures

#### 📊 Historique des liens de partage
- Visualisation de tous les liens générés (actifs et expirés)
- Filtrage par fichier et limite de résultats
- Actions : Copier, Statistiques, Désactiver
- Interface dédiée avec statuts visuels (Actif/Expiré/Désactivé)
- Affichage des métadonnées (dates, téléchargements, protection)

#### 📱 QR Code automatique
- Génération automatique pour chaque lien de partage
- Format Data URL PNG prêt à l'emploi
- Optimisé pour scan mobile
- Affichage dans le modal de partage
- Support de tous les types de liens (protégés ou non)

#### 🔒 Protection par mot de passe
- Mot de passe optionnel lors de la génération du lien
- Hashage sécurisé avec bcrypt (10 rounds)
- Page de saisie HTML intégrée avec design moderne
- Validation côté serveur
- Messages d'erreur clairs
- Indicateur visuel dans l'historique

#### 📈 Compteur de téléchargements
- Comptage automatique à chaque téléchargement
- Logs détaillés (date/heure, IP, user-agent)
- Statistiques par lien avec historique complet
- API dédiée pour consultation
- Export possible pour analyse

### 🗄️ Infrastructure

#### Base de données SQLite
- Table `share_links` pour l'historique des liens
- Table `download_logs` pour les téléchargements
- Index optimisés pour performances
- Nettoyage automatique des liens expirés (toutes les minutes)
- Clés étrangères et contraintes d'intégrité
- Fichier : `backend/shareazure.db`

### 🔧 Backend

#### Nouveaux endpoints API
- `GET /api/share/history` - Liste des liens avec filtres
- `GET /api/share/stats/:linkId` - Statistiques détaillées d'un lien
- `POST /api/share/download/:linkId` - Téléchargement protégé par mot de passe
- `GET /api/share/download/:linkId` - Page HTML de saisie du mot de passe
- `DELETE /api/share/:linkId` - Désactivation manuelle d'un lien

#### Module database.js
- Gestion centralisée de SQLite
- Fonctions CRUD pour share_links
- Fonctions de logging pour download_logs
- Nettoyage automatique périodique
- Statistiques et agrégations

#### Dépendances ajoutées
- `better-sqlite3@^9.x` - Base de données synchrone
- `qrcode@^1.5.x` - Génération de QR Codes
- `bcrypt@^5.1.x` - Hashage sécurisé

#### Modifications serveur
- Endpoint `/api/share/generate` étendu avec password et QR Code
- Logging enrichi avec linkId et hasPassword
- Gestion des liens protégés vs non-protégés
- Redirection automatique pour liens non-protégés

### 💻 Frontend

#### Interface utilisateur
- Nouveau bouton "📊 Historique des partages" dans section fichiers
- Modal d'historique complet avec liste paginée
- Champ mot de passe optionnel dans modal de partage
- Affichage du QR Code dans résultats de génération
- Statistiques détaillées en popup modale
- Design cohérent et responsive

#### Nouvelles fonctions JavaScript
- `showHistory()` - Afficher le modal d'historique
- `displayHistory(links)` - Rendu de la liste des liens
- `viewLinkStats(linkId)` - Consultation des statistiques
- `deactivateLink(linkId)` - Révocation manuelle
- `copyHistoryLink(url)` - Copie depuis l'historique
- `closeHistory()` - Fermeture du modal

#### Styles CSS
- `.history-modal` - Modal d'historique
- `.history-item` - Carte de lien
- `.history-stats` - Grille de statistiques
- `.download-logs` - Liste des téléchargements
- `.share-input` - Champ mot de passe
- `.share-info` - Message d'information
- Responsive complet pour mobile

### 📖 Documentation

#### Nouveau document
- **[docs/ADVANCED_FEATURES.md](docs/ADVANCED_FEATURES.md)** - 1000+ lignes
  - Documentation complète des 4 fonctionnalités
  - Guides d'utilisation détaillés
  - Exemples d'API avec cURL
  - Cas d'usage professionnels
  - Structure de la base de données
  - Maintenance et backup
  - Tests manuels et automatisés
  - Considérations RGPD et privacy
  - Troubleshooting

#### Mises à jour
- README.md : Section fonctionnalités enrichie
- README.md : Nouvelle doc dans la liste
- CHANGELOG.md : Ce fichier restructuré
- Tous les guides : Liens vers ADVANCED_FEATURES.md

### 🔐 Sécurité

- Hashage bcrypt pour mots de passe (non réversible, 10 rounds)
- Logs de téléchargements pour audit et traçabilité
- Possibilité de révocation manuelle avant expiration
- Nettoyage automatique des liens expirés
- Pas d'exposition des mots de passe en base
- Validation stricte des entrées utilisateur

### ⚠️ Breaking Changes

**Aucun** - Rétrocompatibilité totale garantie
- Les anciens liens SAS continuent de fonctionner
- L'API existante (v1.x) n'a pas changé
- Nouvelles fonctionnalités opt-in uniquement
- Pas de migration de base de données requise

### 🐛 Corrections

- Amélioration de la gestion d'erreurs dans la génération de liens
- Messages d'erreur plus explicites et localisés
- Validation renforcée des paramètres d'entrée
- Gestion des cas limites (liens expirés, fichiers supprimés)

### 📊 Métriques

- 4 nouvelles fonctionnalités majeures
- 5 nouveaux endpoints API
- 2 nouvelles tables en base de données
- 3 nouvelles dépendances npm
- ~1800 lignes de code ajoutées
- Documentation : +1000 lignes
- Fichiers créés : 2 (database.js, ADVANCED_FEATURES.md)
- Fichiers modifiés : 6 (server.js, app.js, index.html, styles.css, README.md, CHANGELOG.md)

### 🧪 Tests

- Tests manuels complets documentés
- Exemples cURL pour tous les endpoints
- Scénarios de test pour chaque fonctionnalité
- Checklist de validation complète
- Tests de régression sur fonctionnalités existantes

### 🚀 Migration depuis v1.2.0

1. Installer les nouvelles dépendances :
```bash
cd backend
npm install
```

2. Démarrer le serveur (la DB est créée automatiquement) :
```bash
npm start
```

3. Tester les nouvelles fonctionnalités via l'interface

**Aucune migration de données requise** - Les nouveaux liens seront trackés automatiquement.

---

## [1.2.0] - 2025-01-07

### 🔗 Ajouté - Partage avec Liens Temporaires

**Fonctionnalité majeure : Partage de fichiers avec SAS tokens Azure**

#### Backend
- ✅ Nouveau endpoint `POST /api/share/generate` pour générer des liens SAS
- ✅ Nouveau endpoint `GET /api/share/info/:blobName` pour info fichier
- ✅ Support des durées d'expiration configurable (15 min à 30 jours)
- ✅ Permissions granulaires (lecture, écriture, suppression)
- ✅ Logging des générations de liens
- ✅ Extraction automatique des credentials Azure depuis connection string
- ✅ Validation de l'existence du fichier avant génération

#### Frontend
- ✅ Nouveau modal de partage avec interface intuitive
- ✅ Bouton "🔗 Partager" dans la liste des fichiers
- ✅ Sélecteur de durée d'expiration (7 options)
- ✅ Génération instantanée du lien
- ✅ Copie en un clic dans le presse-papiers
- ✅ Affichage de la date d'expiration
- ✅ Message d'avertissement de sécurité
- ✅ Design responsive et accessible

#### Styles
- ✅ Nouveaux styles pour le modal de partage
- ✅ Animations de confirmation de copie
- ✅ Indicateurs visuels d'expiration
- ✅ Responsive design pour mobile

#### Documentation
- ✅ **[SHARE_FEATURE.md](docs/SHARE_FEATURE.md)** - Documentation complète (1000+ lignes)
  - Vue d'ensemble de la fonctionnalité
  - Guide d'utilisation détaillé
  - Détails techniques des SAS tokens
  - Bonnes pratiques de sécurité
  - API documentation
  - Cas d'usage détaillés
  - Dépannage et FAQ
- ✅ **[SHARE_FEATURE.md](docs/SHARE_FEATURE.md)** - Documentation complète du partage
  - Guide d'utilisation
  - Checklist de validation
  - Exemples pratiques
  - Résolution de problèmes

#### Sécurité
- ✅ Liens en lecture seule par défaut
- ✅ Expiration automatique configurée
- ✅ Pas d'exposition des credentials Azure
- ✅ Documentation des limitations de sécurité
- ✅ Recommandations de bonnes pratiques

### Modifié
- 📝 README.md mis à jour avec la nouvelle fonctionnalité
- 📝 Documentation principale enrichie
- 🎨 Amélioration de l'interface fichiers avec bouton partage

### Technique
- 📦 Utilisation de `generateBlobSASQueryParameters` d'Azure SDK
- 📦 Support de `StorageSharedKeyCredential`
- 📦 Gestion des permissions via `BlobSASPermissions`
- 🔧 Extraction des credentials depuis connection string

### Métriques
```
Code ajouté        : ~500 lignes
Documentation      : ~2000 lignes
Endpoints API      : 2 nouveaux
Durées disponibles : 7 options
Temps de test      : 5 minutes
```

## [1.1.0] - 2025-01-07

### 👁️ Ajouté - Preview de Fichiers

Voir les détails complets dans la version précédente du changelog.

## [1.0.0] - 2025-01-07

### ✨ Ajouté
- Interface web drag & drop pour l'upload de fichiers
- Backend Node.js avec Express et Azure Storage SDK
- Support de l'upload de fichiers multiples
- Barre de progression en temps réel
- Liste et gestion des fichiers uploadés
- Téléchargement de fichiers depuis l'interface
- Suppression de fichiers avec confirmation
- Rate limiting (100 requêtes / 15 minutes)
- Headers de sécurité avec Helmet.js
- Configuration CORS
- Logs structurés en JSON
- Support Docker avec docker-compose
- Script de test de connexion Azure
- Documentation complète (README, guides, architecture)
- Scripts de démarrage/arrêt automatiques

### 🔒 Sécurité
- Validation des types et tailles de fichiers
- Noms de fichiers uniques avec UUID
- Conteneurs privés par défaut
- Limite de taille d'upload configurable (100 MB par défaut)
- Protection contre les injections
- HTTPS recommandé pour la production

### 📚 Documentation
- README.md - Documentation principale
- GETTING_STARTED.md - Guide de démarrage
- GETTING_STARTED.md - Guide de démarrage
- AZURE_SETUP.md - Configuration Azure détaillée
- CUSTOMIZATION.md - Guide de personnalisation
- ARCHITECTURE.md - Diagrammes d'architecture
- CHANGELOG.md - Historique des versions

### 🛠️ Techniques
- Node.js 18+
- Express 4.x
- Azure Storage Blob SDK 12.x
- Multer pour l'upload multipart
- Vanilla JavaScript (pas de framework)
- CSS moderne avec variables et animations
- Support responsive mobile

### 🐳 Déploiement
- Dockerfile optimisé avec healthchecks
- docker-compose.yml pour orchestration
- Configuration Nginx pour le frontend
- Scripts bash pour développement local
- Support Azure App Service

## [1.1.0] - 2025-01-07

### ✨ Ajouté - Fonctionnalité Preview
- 👁️ **Preview de fichiers dans le navigateur** sans téléchargement
- 🖼️ Preview d'images (JPG, PNG, GIF, WebP, SVG, BMP)
  - Affichage en haute résolution
  - Redimensionnement automatique
  - Zoom adaptatif
- 🎥 Preview de vidéos (MP4, WebM, OGG)
  - Lecteur vidéo intégré avec contrôles
  - Plein écran supporté
  - Barre de progression
- 🎵 Preview d'audio (MP3, WAV, OGG, M4A)
  - Lecteur audio avec contrôles
  - Affichage icône musicale
- 📕 Preview de PDFs avec PDF.js
  - Rendu page par page haute qualité
  - Navigation entre pages
  - Compteur de pages
  - Zoom optimisé
- 📝 Preview de fichiers texte (TXT, MD, JSON, JS, HTML, CSS, XML)
  - Coloration syntaxique
  - Police monospace
  - Thème sombre pour code
  - Scrolling fluide
- Modal de preview responsive et élégante
- Détection automatique des types de fichiers prévisualisables
- Bouton "Aperçu" dans la liste des fichiers
- Fermeture avec touche Escape ou bouton ✕
- Gestion d'erreurs complète avec messages utilisateur

### 🛠️ Backend
- Nouvel endpoint `/api/preview/:blobName` pour streaming inline
- Headers CORS configurés pour previews cross-origin
- Logs des opérations de preview
- Content-Disposition inline (vs attachment pour download)

### 📚 Documentation
- **PREVIEW_FEATURE.md** : Documentation complète de la fonctionnalité
  - Guide d'utilisation
  - Types de fichiers supportés
  - Architecture technique
  - Configuration et personnalisation
  - Dépannage
  - Roadmap des améliorations

### 🎨 Interface
- Nouveau bouton "👁️ Aperçu" sur fichiers supportés
- Modal plein écran adaptative (90vw x 90vh)
- Animations fluides d'ouverture/fermeture
- Design cohérent avec le thème violet de l'app
- Responsive sur mobile et tablette

### 📊 Performance
- Chargement progressif des images
- PDFs rendus page par page (pas en mémoire complète)
- Streaming vidéo avec bufferisation
- Nettoyage mémoire à la fermeture

### 🔒 Sécurité
- Échappement HTML pour fichiers texte
- PDFs rendus en canvas (pas d'exécution JS)
- Validation Content-Type côté serveur
- Logs de toutes les previews

## [Unreleased]

### 🔄 Planifié
- [ ] Authentification Azure AD B2C
- [ ] Zoom manuel et rotation pour images
- [ ] Recherche et filtres de fichiers
- [ ] Partage de fichiers avec liens SAS temporaires
- [ ] Compression automatique d'images avec Sharp
- [ ] Versioning de fichiers
- [ ] API REST complète avec Swagger/OpenAPI
- [ ] Tests automatisés (Jest/Mocha)
- [ ] CI/CD avec GitHub Actions
- [ ] Monitoring avancé avec Application Insights
- [ ] Cache Redis pour les métadonnées
- [ ] Support de multiple conteneurs
- [ ] Interface d'administration
- [ ] Notifications email après upload
- [ ] Webhooks pour intégrations
- [ ] Mobile app (React Native)

### 💡 Idées
- Scan antivirus avec Azure Defender
- Traitement d'images avec Azure Cognitive Services
- OCR pour extraction de texte des documents
- Transcription audio/vidéo automatique
- Classification automatique avec IA
- Collaboration temps réel sur documents
- Intégration Teams/Slack
- Export bulk vers OneDrive/SharePoint

---

## Types de changements

- ✨ **Ajouté** : pour les nouvelles fonctionnalités
- 🔄 **Modifié** : pour les modifications de fonctionnalités existantes
- 🐛 **Corrigé** : pour les corrections de bugs
- 🗑️ **Supprimé** : pour les fonctionnalités supprimées
- 🔒 **Sécurité** : pour les corrections de vulnérabilités
- 📚 **Documentation** : pour les mises à jour de documentation
- 🚀 **Performance** : pour les améliorations de performance
- 🛠️ **Techniques** : pour les changements techniques internes

---

Pour toute question ou suggestion, contactez l'équipe STTI d'APRIL.

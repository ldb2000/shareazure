# Fonctionnalites IA / Multimedia

## Vue d'ensemble

ShareAzure integre un module IA complet pour l'analyse automatique des fichiers multimedia. Les fonctionnalites incluent :

- **Analyse d'images et videos** via OpenAI GPT-4 Vision (semantique) et Azure AI Vision (structurelle)
- **Transcription audio/video** via OpenAI Whisper
- **Extraction de geolocalisation** via EXIF GPS + reverse geocoding Nominatim
- **Recherche semantique** avec FTS5 (full-text search)
- **Albums intelligents** avec regles automatiques
- **Reconnaissance faciale** avec galerie de profils
- **Section Decouvrir** pour les utilisateurs (tags, recherche IA, carte)

---

## Section "Decouvrir" (Dashboard Utilisateur)

La section "Decouvrir" donne aux utilisateurs acces aux fonctionnalites IA directement depuis leur dashboard, sans passer par l'interface admin. Elle est accessible via le bouton boussole dans le header.

### Acces

1. Se connecter au dashboard utilisateur (`user.html`)
2. Cliquer sur le bouton **boussole** dans le header
3. La section Decouvrir remplace la liste de fichiers

### 3 sous-onglets

#### Par Tags

Affiche un **nuage de tags** genere par l'analyse IA des fichiers :
- Les tags sont dimensionnes selon leur frequence (petit / moyen / grand)
- Cliquer sur un tag affiche la grille des fichiers associes
- Bouton "Retour aux tags" pour revenir au nuage
- Chaque carte fichier affiche une miniature (images) ou icone, le nom et les tags

**API utilisee :**
```
GET /api/ai/tags                    -> liste des tags avec compteurs
GET /api/ai/tags/:tag/files         -> fichiers associes a un tag
```

#### Recherche IA

Permet une **recherche semantique** sur les descriptions, tags et contenus analyses :
- Barre de recherche avec **suggestions autocomplete** (debounce 300ms)
- Filtre par type de fichier (tous / image / video / audio / document)
- Resultats affiches en grille de cartes cliquables
- Cliquer sur un resultat ouvre le fichier en preview

**API utilisee :**
```
GET /api/ai/search?q=...&type=...   -> resultats de recherche
GET /api/ai/search/suggestions?q=.. -> suggestions autocomplete
```

#### Carte

Affiche une **carte interactive Leaflet.js** avec les fichiers geotagues :
- Centree sur la France par defaut (lat 46.6, lng 1.9, zoom 5)
- Utilise **MarkerCluster** pour les zones denses
- Chaque marqueur affiche un popup avec :
  - Nom du fichier
  - Ville et pays
  - Coordonnees GPS
  - Lien "Voir le fichier"
- Compteur en bas : "X fichiers geotagues"
- La carte s'adapte automatiquement aux bornes des marqueurs

**API utilisee :**
```
GET /api/ai/map                     -> tous les fichiers geotagues
```

### Navigation

- La section Decouvrir est **mutuellement exclusive** avec les sections Fichiers, Partages et Equipe
- Cliquer sur "Fermer" revient a la liste des fichiers
- Naviguer vers Partages ou Equipe ferme automatiquement Decouvrir

### Gestion d'erreur

Si les APIs IA ne sont pas activees (reponse 503 ou 404), un message d'erreur gracieux est affiche :
- "La fonctionnalite IA n'est pas activee sur ce serveur."
- "La fonctionnalite de recherche IA n'est pas activee."
- "La fonctionnalite de geolocalisation n'est pas activee."

### Dependencies frontend

La section Decouvrir utilise les libraries CDN suivantes (ajoutees dans `user.html`) :
- **Leaflet.js 1.9.4** : carte interactive
- **Leaflet MarkerCluster 1.5.3** : regroupement de marqueurs

---

## APIs IA (Backend)

Toutes les APIs IA sont montees sur `/api/ai/` (utilisateurs) et `/api/admin/ai/` (admin).

### Analyse

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/ai/analyze/:blobName` | Lancer l'analyse IA (async, retourne jobId) |
| POST | `/api/ai/analyze-batch` | Analyse par lot de plusieurs fichiers |
| GET | `/api/ai/analysis/:blobName` | Recuperer les resultats d'analyse |
| DELETE | `/api/ai/analysis/:blobName` | Supprimer les donnees d'analyse |
| GET | `/api/ai/job/:jobId` | Statut d'un job |

### Recherche

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/search?q=...` | Recherche semantique (filtres: type, date, tags, faces) |
| GET | `/api/ai/search/suggestions?q=...` | Suggestions autocomplete |
| GET | `/api/ai/tags` | Liste de tous les tags avec compteurs |
| GET | `/api/ai/tags/:tag/files` | Fichiers associes a un tag |

### Visages

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/faces` | Galerie des profils |
| POST | `/api/ai/faces` | Creer un profil |
| PUT | `/api/ai/faces/:profileId` | Renommer un profil |
| DELETE | `/api/ai/faces/:profileId` | Supprimer un profil |
| POST | `/api/ai/faces/:profileId/merge` | Fusionner deux profils |
| GET | `/api/ai/faces/:profileId/files` | Fichiers ou apparait une personne |

### Albums intelligents

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/albums` | Lister les albums |
| POST | `/api/ai/albums` | Creer un album (manuel ou auto) |
| PUT | `/api/ai/albums/:albumId` | Modifier un album |
| DELETE | `/api/ai/albums/:albumId` | Supprimer un album |
| POST | `/api/ai/albums/:albumId/items` | Ajouter des elements |
| DELETE | `/api/ai/albums/:albumId/items/:blobName` | Retirer un element |
| GET | `/api/ai/albums/:albumId/items` | Lister les elements |

### Video

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/video/:blobName/timeline` | Timeline avec marqueurs |
| GET | `/api/ai/video/:blobName/thumbnail/:timestamp` | Miniature a un timestamp |

### Transcription

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/ai/transcribe/:blobName` | Lancer la transcription (async) |
| GET | `/api/ai/transcription/:blobName` | Recuperer la transcription |
| GET | `/api/ai/transcription/:blobName/search?q=...` | Recherche dans la transcription |

### Geolocalisation

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/geolocation/:blobName` | Donnees de geolocalisation d'un fichier |
| GET | `/api/ai/map` | Tous les fichiers geotagues |
| POST | `/api/ai/geolocation/:blobName` | Extraction EXIF GPS manuelle |

### Administration IA

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/ai/dashboard` | Stats IA (analyses, couts, tags, queue) |
| GET | `/api/admin/ai/costs` | Couts detailles par service/modele/periode |
| PUT | `/api/admin/ai/settings` | Configurer les parametres IA |
| POST | `/api/admin/ai/reindex` | Reconstruire l'index FTS5 |
| GET | `/api/admin/ai/scans` | Lister les scans planifies |
| PUT | `/api/admin/ai/scans/:id` | Modifier un scan planifie |
| POST | `/api/admin/ai/scans/:id/run` | Lancer un scan manuellement |

---

## Configuration IA

### Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `OPENAI_API_KEY` | Cle API OpenAI | - |
| `OPENAI_MODEL` | Modele GPT | `gpt-4o` |
| `OPENAI_WHISPER_MODEL` | Modele Whisper | `whisper-1` |
| `AZURE_VISION_ENDPOINT` | Endpoint Azure AI Vision | - |
| `AZURE_VISION_KEY` | Cle Azure AI Vision | - |
| `FFMPEG_PATH` | Chemin ffmpeg personnalise | auto |
| `AI_MAX_CONCURRENT_JOBS` | Jobs IA simultanes max | 3 |
| `AI_AUTO_ANALYZE_ON_UPLOAD` | Auto-analyse a l'upload | false |

### Parametres en base de donnees (table `settings`, categorie `ai`)

| Cle | Description | Defaut |
|-----|-------------|--------|
| `aiEnabled` | Activer le module IA | false |
| `openaiEnabled` | Activer OpenAI | false |
| `azureVisionEnabled` | Activer Azure Vision | false |
| `autoAnalyzeOnUpload` | Auto-analyse | false |
| `maxConcurrentAnalysis` | Jobs simultanes | 3 |
| `faceRecognitionEnabled` | Detection de visages | false |
| `transcriptionEnabled` | Transcription audio/video | false |
| `smartAlbumsEnabled` | Albums intelligents | false |
| `searchEnabled` | Recherche semantique | false |
| `geolocationEnabled` | Extraction GPS | false |
| `reverseGeocodingEnabled` | Reverse geocoding Nominatim | false |
| `videoTimelineEnabled` | Timeline video | false |
| `aiMonthlyBudget` | Budget mensuel IA | 50 |
| `aiCostAlertThreshold` | Seuil d'alerte cout | 80 |

---

## Architecture technique

### Module IA (`backend/ai/`)

```
backend/ai/
├── index.js                  # Router Express (37 endpoints)
├── openaiService.js          # GPT-4 Vision : analyzeImage, generateTags, describeScene
├── azureVisionService.js     # Azure Vision : detectFaces, detectObjects, ocr
├── mediaProcessor.js         # sharp (thumbnails), ffmpeg (video/audio)
├── analysisOrchestrator.js   # Orchestration analyse complete + geoloc
├── geolocationService.js     # EXIF GPS (exifr) + Nominatim
├── scanService.js            # Scans planifies (4 types)
├── searchService.js          # FTS5 search + filtres
├── faceService.js            # Galerie de visages
├── albumService.js           # Albums intelligents
├── transcriptionService.js   # Whisper API
└── jobQueue.js               # p-queue wrapper
```

### Tables de la base de donnees

| Table | Description |
|-------|-------------|
| `media_analysis` | Resultats d'analyse par fichier |
| `face_profiles` | Profils de visages nommes |
| `face_occurrences` | Occurrences de visages dans les fichiers |
| `smart_albums` | Albums (manuels ou avec regles auto) |
| `smart_album_items` | Elements des albums |
| `transcriptions` | Transcriptions audio/video |
| `video_markers` | Marqueurs de timeline video |
| `ai_cost_tracking` | Suivi des couts par service/modele |
| `search_index` | Index FTS5 pour la recherche |
| `geolocation` | Donnees GPS extraites des fichiers |
| `scan_schedules` | Planification des scans automatiques |

### Interface admin IA

L'onglet **IA** dans l'interface admin comporte 5 sous-onglets :
1. **Dashboard** : statistiques, couts, top tags, queue
2. **Services** : toggles pour chaque service IA
3. **Parametres** : modeles, seuils, budget, jobs
4. **Scans** : 4 types de scan (faces, tagging, geoloc, full) avec planification
5. **Carte** : carte Leaflet avec tous les fichiers geotagues (admin)

---

## Exemples curl

```bash
# Lister les tags
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ai/tags

# Rechercher des fichiers
curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/ai/search?q=paysage&type=image"

# Obtenir les suggestions
curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/ai/search/suggestions?q=pay"

# Fichiers geotagues pour la carte
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ai/map

# Fichiers d'un tag
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ai/tags/nature/files

# Lancer une analyse
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ai/analyze/mon-fichier.jpg

# Geolocalisation d'un fichier
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ai/geolocation/photo.jpg
```

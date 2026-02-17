# 🤖 ShareAzure — Plan IA Complet

## Vue d'ensemble

ShareAzure intègre **6 services IA** basés sur Azure Cognitive Services et OpenAI :

| Service | Techno | Région Azure | Statut |
|---------|--------|--------------|--------|
| 🖼️ Vision (analyse d'image) | Azure Computer Vision 4.0 | francecentral | ✅ Implémenté |
| 🧠 Analyse sémantique | Azure OpenAI GPT-4o | francecentral | ✅ Implémenté |
| 🎤 Transcription audio/vidéo | Azure OpenAI Whisper | westeurope | ✅ Implémenté |
| 👤 Reconnaissance faciale | Azure Vision + profils locaux | francecentral | ✅ Implémenté |
| 🗺️ Géolocalisation | EXIF GPS + reverse geocoding | local | ✅ Implémenté |
| 🔍 Recherche intelligente | FTS5 SQLite (full-text search) | local | ✅ Implémenté |

---

## 1. 🖼️ Analyse d'image (Azure Vision)

### Ce que ça fait
- **Tags automatiques** : identifie les objets, scènes, activités (ex: "montagne", "personne", "voiture")
- **Description** : génère une phrase décrivant l'image
- **OCR** : extrait tout le texte visible dans l'image (panneaux, documents, écrans)
- **Détection d'objets** : localise les objets avec leur position (bounding box)
- **Couleurs dominantes** : palette de couleurs, couleur d'accent
- **Catégorisation** : classement par catégorie (paysage, portrait, nourriture...)

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/ai/analyze/:blobName` | Lance l'analyse IA d'un fichier |
| `POST` | `/api/ai/analyze-batch` | Analyse en lot (max 20 fichiers) |
| `GET` | `/api/ai/analysis/:blobName` | Récupère les résultats d'analyse |
| `DELETE` | `/api/ai/analysis/:blobName` | Supprime les données d'analyse |
| `GET` | `/api/ai/job/:jobId` | Statut d'un job d'analyse en cours |

### Confirmation / Validation
- `GET /api/ai/analysis/:blobName` → retourne `tags`, `description`, `azure_result.ocrText`, `confidence`
- Le champ `status` indique : `pending` → `processing` → `completed` / `failed`
- Le champ `confidence` (0-1) mesure la certitude de l'IA

---

## 2. 🧠 Analyse sémantique (GPT-4o)

### Ce que ça fait
- **Description riche** : comprend le contexte de l'image, pas juste les objets
- **Tags intelligents** : tags plus abstraits ("réunion d'équipe", "présentation", "célébration")
- Fonctionne en complément d'Azure Vision (fusion des tags)

### Routes API
Mêmes routes que l'analyse d'image — GPT-4o est appelé automatiquement dans le pipeline `analyzeFile()`.

### Confirmation / Validation
- `GET /api/ai/analysis/:blobName` → champ `openai_result` contient la réponse GPT-4o
- Les tags OpenAI sont fusionnés avec les tags Azure dans le champ `tags`

---

## 3. 🎤 Transcription audio/vidéo (Whisper)

### Ce que ça fait
- **Transcription** : convertit l'audio en texte (français, anglais, multilingue)
- **Segments temporels** : chaque phrase a un timestamp (début/fin)
- **Vidéos** : extrait la piste audio puis transcrit
- **Marqueurs** : les phrases deviennent des marqueurs sur la timeline vidéo (type `keyword`)

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/ai/transcribe/:blobName` | Lance la transcription (async) |
| `GET` | `/api/ai/transcription/:blobName` | Récupère la transcription complète |
| `GET` | `/api/ai/transcription/:blobName/search?q=mot` | Recherche dans la transcription |

### Confirmation / Validation
- `GET /api/ai/transcription/:blobName` → retourne `text` (texte complet) + `segments` (avec timestamps)
- Chaque segment : `{ start: 12.5, end: 15.2, text: "Bonjour à tous" }`
- Recherche : retourne les segments contenant le mot avec leur position temporelle

---

## 4. 👤 Reconnaissance faciale

### Ce que ça fait
- **Détection** : repère les visages dans les images ET les vidéos (5 frames analysées)
- **Profils** : créer des profils nommés ("Laurent", "Sophie")
- **Assignation** : associer un visage détecté à un profil
- **Regroupement** : retrouver toutes les photos/vidéos d'une personne
- **Fusion** : fusionner deux profils qui sont la même personne
- **Vidéo** : marqueurs temporels pour chaque visage (type `face`)

### Routes API — Admin (`/api/admin/faces/`)
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/admin/faces/profiles` | Liste tous les profils |
| `POST` | `/api/admin/faces/profiles` | Créer un profil `{ name }` |
| `PUT` | `/api/admin/faces/profiles/:id` | Renommer un profil |
| `DELETE` | `/api/admin/faces/profiles/:id` | Supprimer un profil |
| `GET` | `/api/admin/faces/profiles/:id/files` | Photos/vidéos de cette personne |
| `POST` | `/api/admin/faces/profiles/merge` | Fusionner `{ targetId, sourceId }` |
| `GET` | `/api/admin/faces/occurrences` | Toutes les détections (avec profil) |
| `GET` | `/api/admin/faces/occurrences/unassigned` | Visages non identifiés |
| `GET` | `/api/admin/faces/file/:blobName` | Visages détectés dans un fichier |
| `PUT` | `/api/admin/faces/occurrences/:id/assign` | Assigner à un profil `{ profileId }` |

### Routes API — Utilisateur (`/api/ai/faces/`)
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/ai/faces` | Liste les profils |
| `POST` | `/api/ai/faces` | Créer un profil |
| `PUT` | `/api/ai/faces/:profileId` | Renommer |
| `DELETE` | `/api/ai/faces/:profileId` | Supprimer |
| `POST` | `/api/ai/faces/:profileId/merge` | Fusionner |
| `GET` | `/api/ai/faces/:profileId/files` | Fichiers de cette personne |

### Confirmation / Validation
- `GET /api/admin/faces/occurrences/unassigned` → visages détectés à trier
- Chaque occurrence : `{ id, blob_name, bounding_box, confidence, timestamp }`
- `confidence` : % de certitude (ex: 0.92 = 92%)
- `bounding_box` : position du visage dans l'image
- `timestamp` : seconde dans la vidéo (null pour les images)

### ⚠️ Sécurité (à implémenter)
> **Note Laurent** : Le tagging de visages doit être restreint par **équipe ou admin**. Actuellement, les routes admin sont protégées par `authenticateUser + requireAdmin`. Les routes `/api/ai/faces/` sont accessibles à tout utilisateur connecté — il faudra ajouter un filtrage par équipe.

---

## 5. 🗺️ Géolocalisation

### Ce que ça fait
- **Extraction EXIF** : lit les coordonnées GPS des métadonnées photos
- **Reverse geocoding** : convertit lat/long en adresse (ville, pays)
- **Carte** : affiche tous les fichiers géotaggés sur une carte Leaflet

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/ai/geolocation/:blobName` | Données géo d'un fichier |
| `POST` | `/api/ai/geolocation/:blobName` | Extraction manuelle GPS |
| `GET` | `/api/ai/map` | Tous les fichiers géotaggés (pour carte) |

### Confirmation / Validation
- Retourne : `{ latitude, longitude, address, city, country, raw_exif }`
- `GET /api/ai/map` → liste pour afficher les marqueurs sur carte

---

## 6. 🔍 Recherche intelligente (FTS5)

### Ce que ça fait
- **Full-text search** sur : tags, descriptions, transcriptions, texte OCR, noms de visages
- **Auto-suggestions** pendant la frappe
- **Filtres** : type de fichier, dates, tags, profil de visage
- **Indexation automatique** après chaque analyse

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/ai/search?q=mot` | Recherche globale |
| `GET` | `/api/ai/search/suggestions?q=mo` | Auto-complétion |
| `GET` | `/api/ai/tags` | Tous les tags avec compteurs |
| `GET` | `/api/ai/tags/:tag/files` | Fichiers par tag |
| `POST` | `/api/admin/ai/reindex` | Reconstruire l'index (admin) |

### Paramètres de recherche
```
GET /api/ai/search?q=montagne&type=image&dateFrom=2026-01-01&tags=nature,paysage&limit=50
```

---

## 7. 📸 Albums intelligents

### Ce que ça fait
- **Albums manuels** : créer et ajouter des fichiers à la main
- **Albums automatiques** : se remplissent selon des règles (par tag, par personne, par lieu, par date)

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/ai/albums` | Lister les albums |
| `POST` | `/api/ai/albums` | Créer `{ name, type: "manual"/"auto", rules }` |
| `PUT` | `/api/ai/albums/:id` | Modifier |
| `DELETE` | `/api/ai/albums/:id` | Supprimer |
| `POST` | `/api/ai/albums/:id/items` | Ajouter des fichiers `{ blobNames }` |
| `DELETE` | `/api/ai/albums/:id/items/:blobName` | Retirer un fichier |
| `GET` | `/api/ai/albums/:id/items` | Contenu de l'album |

---

## 8. 🎬 Timeline vidéo (marqueurs)

### Ce que ça fait
- **Marqueurs de scène** : changements de scène détectés par GPT-4o
- **Marqueurs de visage** : moments où des visages apparaissent
- **Marqueurs de texte** : texte détecté par OCR dans les frames *(NOUVEAU)*
- **Marqueurs de mots-clés** : phrases clés de la transcription

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/ai/video/:blobName/timeline` | Tous les marqueurs |
| `GET` | `/api/ai/video/:blobName/timeline?type=face` | Filtrer par type |
| `GET` | `/api/ai/video/:blobName/thumbnail/:timestamp` | Image à un moment |

### Types de marqueurs
| Type | Description | Source |
|------|-------------|--------|
| `scene` | Changement de scène | GPT-4o (5 frames) |
| `face` | Visage détecté | Azure Vision (5 frames) |
| `text` | Texte visible (OCR) | Azure Vision OCR (4 frames) |
| `keyword` | Phrase transcrite | Whisper |

---

## 9. 💰 Suivi des coûts IA

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/admin/ai/dashboard` | Stats globales IA |
| `GET` | `/api/admin/ai/costs?startDate=...&endDate=...` | Coûts détaillés |
| `GET` | `/api/admin/costs` | Coûts admin globaux |
| `GET` | `/api/costs/user/:userId` | Coûts par utilisateur |
| `GET` | `/api/costs/team/:teamId` | Coûts par équipe |

---

## 10. ⚙️ Administration IA

### Routes API
| Méthode | Route | Description |
|---------|-------|-------------|
| `PUT` | `/api/admin/ai/settings` | Configurer les paramètres IA |
| `POST` | `/api/admin/ai/reindex` | Reconstruire l'index de recherche |
| `GET` | `/api/admin/ai/scans` | Lister les scans planifiés |
| `PUT` | `/api/admin/ai/scans/:id` | Modifier un scan |
| `POST` | `/api/admin/ai/scans/:id/run` | Lancer un scan manuellement |

### Paramètres configurables
| Clé | Description | Défaut |
|-----|-------------|--------|
| `aiEnabled` | Activer/désactiver toute l'IA | true |
| `openaiEnabled` | GPT-4o actif | true |
| `azureVisionEnabled` | Azure Vision actif | true |
| `transcriptionEnabled` | Whisper actif | true |
| `faceRecognitionEnabled` | Reconnaissance faciale | true |
| `faceMinConfidence` | Seuil confiance visages | 0.7 |
| `geolocationEnabled` | Extraction GPS | true |
| `reverseGeocodingEnabled` | Conversion GPS → adresse | true |
| `searchEnabled` | Recherche FTS | true |
| `smartAlbumsEnabled` | Albums auto | true |
| `autoAnalyzeOnUpload` | Analyser auto à l'upload | true |
| `aiMonthlyBudget` | Budget mensuel (€) | 50 |
| `aiCostAlertThreshold` | Alerte à N% du budget | 80 |
| `videoFrameInterval` | Intervalle extraction frames (s) | 5 |

---

## 📊 Pipeline d'analyse complet

```
Upload fichier
    │
    ▼
┌─────────────────────────┐
│  analysisOrchestrator   │
│  .analyzeFile()         │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │  Image  │──► Azure Vision (tags, caption, objets, couleurs, catégories)
    │         │──► Azure Vision OCR (texte)
    │         │──► GPT-4o (description sémantique, tags intelligents)
    │         │──► Détection visages → face_occurrences
    │         │──► Extraction EXIF GPS → géolocalisation
    │         │──► Génération thumbnail
    │         │
    │  Vidéo  │──► Extraction frames (ffmpeg)
    │         │──► GPT-4o par frame (5 frames) → marqueurs scène
    │         │──► Azure Vision par frame (5 frames) → visages + tags
    │         │──► Azure OCR par frame (4 frames) → texte détecté
    │         │──► Whisper (piste audio) → transcription + marqueurs mots-clés
    │         │──► Extraction EXIF GPS → géolocalisation
    │         │──► Génération thumbnail
    │         │
    │  Audio  │──► Whisper → transcription
    └────┬────┘
         │
         ▼
    Index de recherche FTS5 (tags + description + transcription + OCR + visages)
```

---

## 🔐 Sécurité et accès

| Niveau | Routes | Qui peut |
|--------|--------|----------|
| **Public** | Aucune | — |
| **Utilisateur** | `/api/ai/*` | Tout utilisateur connecté |
| **Admin** | `/api/admin/ai/*`, `/api/admin/faces/*` | Admin uniquement |

### ⚠️ TODO : Filtrage par équipe
Les visages (`/api/ai/faces/`) et les albums sont actuellement accessibles à **tous les utilisateurs connectés**. Il faudrait :
1. Ajouter `team_id` sur `face_profiles` et `smart_albums`
2. Filtrer par l'équipe de l'utilisateur connecté
3. Permettre aux admins de voir tout

---

## 📋 Résumé des capacités

| Fonctionnalité | Image | Vidéo | Audio |
|----------------|:-----:|:-----:|:-----:|
| Tags automatiques | ✅ | ✅ | — |
| Description IA | ✅ | ✅ | — |
| OCR (texte) | ✅ | ✅ | — |
| Visages | ✅ | ✅ | — |
| Transcription | — | ✅ | ✅ |
| Géolocalisation | ✅ | ✅ | — |
| Timeline/Marqueurs | — | ✅ | — |
| Recherche | ✅ | ✅ | ✅ |
| Albums | ✅ | ✅ | ✅ |
| Suivi coûts | ✅ | ✅ | ✅ |

---

*Généré le 16 février 2026 — ShareAzure IA v1.0*

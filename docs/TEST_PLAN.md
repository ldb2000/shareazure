# 📋 Plan de Test — ShareAzure
**Version** : 3.1  
**Date** : 16 février 2026  
**Auteur** : Le Claude  
**URL** : Tunnel Cloudflare (HTTPS)  

---

## Légende

| Statut | Signification |
|--------|--------------|
| ⬜ | Non testé |
| ✅ | OK |
| ❌ | KO — à corriger |
| ⚠️ | Partiel / Warning |

---

## 1. AUTHENTIFICATION & ACCÈS

### 1.1 Login local
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 1.1.1 | Se connecter avec `admin` / `admin123` | ⬜ | Doit rediriger vers `/admin/` |
| 1.1.2 | Se connecter avec `user` / `user123` | ⬜ | Doit rediriger vers `user.html` |
| 1.1.3 | Login avec mauvais mot de passe | ⬜ | Message "Identifiants invalides" |
| 1.1.4 | Login avec utilisateur inexistant | ⬜ | Message d'erreur approprié |
| 1.1.5 | "Se souvenir de moi" coché → fermer/rouvrir navigateur | ⬜ | Session persistante (localStorage) |
| 1.1.6 | "Se souvenir de moi" non coché → fermer/rouvrir | ⬜ | Session perdue (sessionStorage) |
| 1.1.7 | Vérifier que les identifiants par défaut ne sont plus affichés | ⬜ | Page login propre |

### 1.2 Azure Entra ID (SSO)
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 1.2.1 | Admin → Paramètres → Authentification : changer mode en "Hybride" | ⬜ | Section Entra apparaît |
| 1.2.2 | Remplir Tenant ID, Client ID, Client Secret | ⬜ | Enregistrer OK |
| 1.2.3 | Bouton "Tester la connexion" | ⬜ | Résultat vert si config correcte |
| 1.2.4 | Page login : bouton "Se connecter avec Microsoft" visible | ⬜ | Seulement en mode hybride/entra |
| 1.2.5 | Cliquer bouton Microsoft → redirection vers login.microsoftonline.com | ⬜ | |
| 1.2.6 | Callback après auth Microsoft → utilisateur créé/connecté | ⬜ | |
| 1.2.7 | Mode "Entra uniquement" → formulaire local masqué | ⬜ | |
| 1.2.8 | Mode "Local uniquement" → bouton Microsoft masqué | ⬜ | |

### 1.3 Comptes invités
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 1.3.1 | Créer un compte invité depuis l'admin | ⬜ | |
| 1.3.2 | Se connecter en tant qu'invité (`guest-login.html`) | ⬜ | |
| 1.3.3 | Désactiver un compte invité | ⬜ | Connexion impossible ensuite |
| 1.3.4 | Supprimer un compte invité | ⬜ | |

---

## 2. UPLOAD DE FICHIERS

### 2.1 Upload simple
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 2.1.1 | Upload d'une image (JPG, PNG) via drag & drop | ⬜ | Barre de progression visible |
| 2.1.2 | Upload d'un PDF via bouton parcourir | ⬜ | |
| 2.1.3 | Upload d'un fichier vidéo (MP4) | ⬜ | |
| 2.1.4 | Upload d'un fichier audio (MP3, OGG) | ⬜ | |
| 2.1.5 | Upload d'un fichier texte (.txt, .csv) | ⬜ | |
| 2.1.6 | Upload d'un fichier > 100 Mo (limite par défaut) | ⬜ | Erreur taille max |

### 2.2 Upload multiple
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 2.2.1 | Sélectionner et uploader 3 fichiers en même temps | ⬜ | Barres de progression individuelles |
| 2.2.2 | Drag & drop de plusieurs fichiers | ⬜ | |
| 2.2.3 | Upload de plus de 10 fichiers simultanés | ⬜ | Limite à 10 par batch |

### 2.3 Preview de fichiers
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 2.3.1 | Preview d'une image (JPG/PNG/WebP) | ⬜ | Affichage inline |
| 2.3.2 | Preview d'un PDF | ⬜ | Viewer intégré |
| 2.3.3 | Preview d'une vidéo | ⬜ | Player HTML5 |
| 2.3.4 | Preview d'un audio | ⬜ | Player audio |
| 2.3.5 | Preview d'un fichier texte | ⬜ | Contenu affiché |
| 2.3.6 | Preview d'un SVG | ⬜ | Rendu correct |

---

## 3. GESTION DES FICHIERS

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 3.1 | Lister les fichiers uploadés | ⬜ | Nom, taille, date, type |
| 3.2 | Télécharger un fichier | ⬜ | Téléchargement correct |
| 3.3 | Supprimer un fichier (admin) | ⬜ | Supprimé d'Azure Blob |
| 3.4 | Créer un dossier (user) | ⬜ | |
| 3.5 | Renommer un fichier (user) | ⬜ | |
| 3.6 | Déplacer un fichier dans un dossier (user) | ⬜ | |
| 3.7 | Supprimer un fichier (user, ses propres fichiers) | ⬜ | |
| 3.8 | Actions en masse : sélectionner + supprimer (admin) | ⬜ | |

---

## 4. PARTAGE DE FICHIERS

### 4.1 Création de liens
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 4.1.1 | Générer un lien de partage pour un fichier | ⬜ | Lien SAS temporaire |
| 4.1.2 | Définir une durée d'expiration (ex: 60 min) | ⬜ | |
| 4.1.3 | Partage avec email obligatoire | ⬜ | |
| 4.1.4 | Partage à plusieurs emails | ⬜ | |
| 4.1.5 | Partage avec mot de passe | ⬜ | |
| 4.1.6 | Vérifier la génération du QR Code | ⬜ | QR affiché et scannable |

### 4.2 Accès aux liens
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 4.2.1 | Accéder à un lien valide → téléchargement | ⬜ | |
| 4.2.2 | Accéder à un lien expiré → erreur | ⬜ | Message "lien expiré" |
| 4.2.3 | Accéder avec mauvais mot de passe → refusé | ⬜ | |
| 4.2.4 | Accéder avec bon mot de passe → téléchargement | ⬜ | |
| 4.2.5 | Compteur de téléchargements incrémenté | ⬜ | Visible dans l'historique |

### 4.3 Gestion des liens
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 4.3.1 | Voir l'historique des liens générés | ⬜ | |
| 4.3.2 | Voir les statistiques d'un lien (téléchargements) | ⬜ | |
| 4.3.3 | Révoquer un lien actif | ⬜ | Accès impossible ensuite |
| 4.3.4 | Export CSV de l'historique des partages | ⬜ | |

---

## 5. ADMINISTRATION

### 5.1 Dashboard
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.1.1 | Affichage des statistiques (nb fichiers, stockage, partages) | ⬜ | |
| 5.1.2 | Graphique uploads par jour (Chart.js) | ⬜ | |
| 5.1.3 | Graphique types de fichiers | ⬜ | |
| 5.1.4 | Bouton refresh actualise les données | ⬜ | |

### 5.2 Gestion des fichiers (admin)
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.2.1 | Recherche de fichiers par nom | ⬜ | |
| 5.2.2 | Filtres par type de fichier | ⬜ | |
| 5.2.3 | Tri par nom/taille/date | ⬜ | |
| 5.2.4 | Actions en masse (supprimer) | ⬜ | |

### 5.3 Gestion des utilisateurs
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.3.1 | Lister tous les utilisateurs | ⬜ | |
| 5.3.2 | Créer un utilisateur local | ⬜ | Avec rôle admin/user/april_user |
| 5.3.3 | Modifier un utilisateur (rôle, nom) | ⬜ | |
| 5.3.4 | Désactiver un utilisateur | ⬜ | |
| 5.3.5 | Réactiver un utilisateur | ⬜ | |
| 5.3.6 | Réinitialiser le mot de passe | ⬜ | |
| 5.3.7 | Supprimer un utilisateur | ⬜ | |

### 5.4 Gestion des équipes
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.4.1 | Créer une équipe | ⬜ | |
| 5.4.2 | Ajouter un membre à une équipe | ⬜ | |
| 5.4.3 | Retirer un membre d'une équipe | ⬜ | |
| 5.4.4 | Supprimer une équipe | ⬜ | |

### 5.5 Logs système
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.5.1 | Affichage de la liste des logs | ⬜ | |
| 5.5.2 | Filtre par niveau (info, warning, error, success) | ⬜ | |
| 5.5.3 | Filtre par catégorie (auth, file, share, domain) | ⬜ | |
| 5.5.4 | Recherche dans les logs | ⬜ | |
| 5.5.5 | Pagination des logs | ⬜ | |
| 5.5.6 | Export des logs | ⬜ | |
| 5.5.7 | Effacer tous les logs | ⬜ | Avec confirmation |

### 5.6 Coûts
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 5.6.1 | Affichage des coûts de stockage | ⬜ | |
| 5.6.2 | Répartition par tier (Hot/Cool/Archive) | ⬜ | |

---

## 6. PARAMÈTRES

### 6.1 Général — Stockage
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.1.1 | Modifier la taille max par fichier | ⬜ | Appliquer + vérifier upload |
| 6.1.2 | Modifier le quota de stockage | ⬜ | |
| 6.1.3 | Enregistrer → notification succès | ⬜ | |
| 6.1.4 | Réinitialiser les paramètres | ⬜ | Valeurs par défaut |

### 6.2 Général — Partage
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.2.1 | Modifier la durée max d'expiration | ⬜ | |
| 6.2.2 | Modifier la durée par défaut | ⬜ | |
| 6.2.3 | Activer "Exiger un mot de passe" | ⬜ | Vérifié à la création d'un lien |

### 6.3 Général — Notifications
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.3.1 | Activer/désactiver notifications uploads | ⬜ | |
| 6.3.2 | Activer/désactiver notifications partages | ⬜ | |
| 6.3.3 | Activer/désactiver alerte quota | ⬜ | |

### 6.4 Sécurité — Logs de sécurité
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.4.1 | Modifier le rate limiting | ⬜ | |
| 6.4.2 | Activer/désactiver les logs détaillés | ⬜ | |
| 6.4.3 | Activer/désactiver l'audit trail | ⬜ | |

### 6.5 Sécurité — Domaines d'emails autorisés
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.5.1 | Ajouter un domaine (ex: `april.com`) | ⬜ | |
| 6.5.2 | Vérifier la date de création (WHOIS) | ⬜ | Colonne "Création" remplie |
| 6.5.3 | Vérifier le statut DMARC | ⬜ | Icône verte ou jaune |
| 6.5.4 | Vérifier le logo (favicon ou BIMI) | ⬜ | Affiché à côté du nom |
| 6.5.5 | Ajouter un domaine jeune (< 6 mois) | ⬜ | Badge rouge "Domaine récent" |
| 6.5.6 | Importer depuis un fichier .txt | ⬜ | Résumé importés/ignorés |
| 6.5.7 | Désactiver un domaine | ⬜ | |
| 6.5.8 | Réactiver un domaine | ⬜ | |
| 6.5.9 | Supprimer un domaine | ⬜ | |
| 6.5.10 | Bouton "Revérifier" (refresh WHOIS + DMARC) | ⬜ | |
| 6.5.11 | Import bulk > 100 domaines → erreur limite | ⬜ | |

### 6.6 Sécurité — Authentification
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 6.6.1 | Changer mode Local → Hybride | ⬜ | Section Entra apparaît |
| 6.6.2 | Changer mode Hybride → Entra uniquement | ⬜ | |
| 6.6.3 | Enregistrer la config Entra | ⬜ | |
| 6.6.4 | Tester la connexion Entra | ⬜ | |
| 6.6.5 | Revenir en mode Local | ⬜ | Bouton MS disparaît du login |

---

## 7. INTELLIGENCE ARTIFICIELLE

### 7.1 Dashboard IA
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.1.1 | Affichage du nombre d'analyses | ⬜ | |
| 7.1.2 | Affichage du coût mensuel IA | ⬜ | |
| 7.1.3 | Affichage du % budget utilisé | ⬜ | |
| 7.1.4 | Top Tags affichés | ⬜ | |
| 7.1.5 | Coûts par service affichés | ⬜ | |

### 7.2 Services IA
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.2.1 | Toggle global IA (activer/désactiver tout) | ⬜ | |
| 7.2.2 | Activer OpenAI GPT-4 Vision | ⬜ | |
| 7.2.3 | Activer Azure AI Vision | ⬜ | |
| 7.2.4 | Activer Whisper (transcription) | ⬜ | |
| 7.2.5 | Activer Reconnaissance faciale | ⬜ | |
| 7.2.6 | Activer Géolocalisation | ⬜ | |
| 7.2.7 | Activer Recherche sémantique | ⬜ | |
| 7.2.8 | Activer Albums intelligents | ⬜ | |
| 7.2.9 | Activer Timeline vidéo | ⬜ | |
| 7.2.10 | Activer Auto-analyse à l'upload | ⬜ | |
| 7.2.11 | Activer Reverse geocoding | ⬜ | |
| 7.2.12 | Enregistrer les services → notification succès | ⬜ | |

### 7.3 Paramètres IA
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.3.1 | Changer le modèle OpenAI (GPT-4o / GPT-4 / GPT-3.5) | ⬜ | |
| 7.3.2 | Changer le modèle Whisper | ⬜ | |
| 7.3.3 | Modifier la confiance faciale min | ⬜ | |
| 7.3.4 | Modifier le budget mensuel IA | ⬜ | |
| 7.3.5 | Modifier le seuil alerte budget | ⬜ | |
| 7.3.6 | Enregistrer → notification succès | ⬜ | |

### 7.4 Analyse de fichiers
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.4.1 | Upload image → analyse IA auto (si activé) | ⬜ | Tags, description générés |
| 7.4.2 | Upload vidéo → transcription Whisper (si activé) | ⬜ | Texte transcrit |
| 7.4.3 | Upload audio → transcription Whisper | ⬜ | |
| 7.4.4 | Upload photo avec GPS → extraction géolocalisation | ⬜ | Coordonnées + adresse |
| 7.4.5 | Upload photo avec visage → détection faciale | ⬜ | Profil créé/associé |

### 7.5 Scans planifiés
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.5.1 | Voir la liste des scans planifiés | ⬜ | |
| 7.5.2 | Activer/désactiver un scan | ⬜ | |
| 7.5.3 | Lancer un scan manuellement | ⬜ | |
| 7.5.4 | Réindexer la recherche | ⬜ | Notification succès |

### 7.6 Carte interactive
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 7.6.1 | Affichage de la carte Leaflet.js | ⬜ | |
| 7.6.2 | Markers pour les fichiers géotagués | ⬜ | |
| 7.6.3 | Clustering des markers | ⬜ | |

---

## 8. SECTION "DÉCOUVRIR" (frontend)

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 8.1 | Nuage de tags IA | ⬜ | Taille proportionnelle |
| 8.2 | Recherche IA sémantique | ⬜ | Suggestions autocomplete |
| 8.3 | Filtres par type de fichier | ⬜ | |
| 8.4 | Carte interactive des fichiers géotagués | ⬜ | |

---

## 9. RESPONSIVE & MOBILE

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 9.1 | Admin — Bouton hamburger visible sur mobile | ⬜ | |
| 9.2 | Admin — Sidebar s'ouvre au clic hamburger | ⬜ | |
| 9.3 | Admin — Sidebar se ferme en cliquant l'overlay | ⬜ | |
| 9.4 | Admin — Sidebar se ferme en cliquant un lien | ⬜ | |
| 9.5 | Admin — Logo APRIL visible dans la sidebar mobile | ⬜ | Sous la barre de statut iPhone |
| 9.6 | Admin — Tableaux scrollables horizontalement | ⬜ | |
| 9.7 | Frontend — Page login responsive | ⬜ | |
| 9.8 | Frontend — Upload drag & drop sur mobile | ⬜ | |
| 9.9 | Frontend — Preview fichiers sur mobile | ⬜ | |

---

## 10. SÉCURITÉ

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 10.1 | Rate limiting : envoyer 100+ requêtes en 15 min | ⬜ | Bloqué après le seuil |
| 10.2 | Headers Helmet.js présents (X-Frame-Options, etc.) | ⬜ | Vérifier dans DevTools |
| 10.3 | CORS : requête depuis domaine non autorisé → bloqué | ⬜ | |
| 10.4 | Accès admin sans token → refusé (401) | ⬜ | Routes protégées |
| 10.5 | Token expiré/invalide → refusé | ⬜ | |
| 10.6 | Noms de fichiers UUID (pas de nom original dans le blob) | ⬜ | |
| 10.7 | Container Azure en mode privé | ⬜ | Pas d'accès public |
| 10.8 | Mot de passe partage ne transite pas dans l'URL | ⬜ | POST uniquement |
| 10.9 | TLS 1.2 minimum sur le storage account | ⬜ | |
| 10.10 | Soft delete activé (7 jours) | ⬜ | |

---

## 11. INFRASTRUCTURE TERRAFORM

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 11.1 | `terraform plan` sans erreur | ⬜ | |
| 11.2 | `terraform apply` crée les ressources | ⬜ | |
| 11.3 | `terraform output -raw env_template` génère le .env | ⬜ | |
| 11.4 | Storage Account en France Central | ⬜ | |
| 11.5 | Azure OpenAI GPT-4o en France Central | ⬜ | |
| 11.6 | Azure OpenAI Whisper en West Europe | ⬜ | |
| 11.7 | Computer Vision en France Central | ⬜ | |
| 11.8 | Application Insights opérationnel | ⬜ | |

---

## 12. PAGES UTILISATEUR

### 12.1 Page User (`user.html`)
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 12.1.1 | Voir ses fichiers uploadés | ⬜ | |
| 12.1.2 | Uploader un fichier | ⬜ | |
| 12.1.3 | Créer un dossier | ⬜ | |
| 12.1.4 | Déplacer/renommer un fichier | ⬜ | |
| 12.1.5 | Partager un fichier | ⬜ | |
| 12.1.6 | Voir ses liens de partage | ⬜ | |

### 12.2 Page Team (`team.html`)
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 12.2.1 | Voir les fichiers de l'équipe | ⬜ | |
| 12.2.2 | Gérer les membres (team leader) | ⬜ | |

### 12.3 Page Guest (`guest-upload.html`)
| # | Test | Résultat | Notes |
|---|------|----------|-------|
| 12.3.1 | Login invité | ⬜ | |
| 12.3.2 | Upload en tant qu'invité | ⬜ | |
| 12.3.3 | Restrictions invité (pas de suppression, etc.) | ⬜ | |

---

## Résumé

| Section | Tests | OK | KO | Non testé |
|---------|-------|----|----|-----------|
| 1. Authentification | 19 | | | 19 |
| 2. Upload | 14 | | | 14 |
| 3. Gestion fichiers | 8 | | | 8 |
| 4. Partage | 13 | | | 13 |
| 5. Administration | 23 | | | 23 |
| 6. Paramètres | 22 | | | 22 |
| 7. Intelligence Artificielle | 22 | | | 22 |
| 8. Découvrir | 4 | | | 4 |
| 9. Responsive & Mobile | 9 | | | 9 |
| 10. Sécurité | 10 | | | 10 |
| 11. Infrastructure | 8 | | | 8 |
| 12. Pages utilisateur | 11 | | | 11 |
| **TOTAL** | **163** | | | **163** |

---

*Généré le 16/02/2026 — ShareAzure v3.1*

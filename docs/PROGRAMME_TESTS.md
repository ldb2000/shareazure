# 📋 Programme de Tests — ShareAzure

> **Version** : 1.0 — 18 février 2026
> **Application** : ShareAzure (File Sharing Entreprise)
> **Environnement** : https://shareazure.deberti.fr
> **Comptes de test** : admin/admin123, user/user123, april→com (rôle com)

---

## Table des matières

1. [Authentification & Sécurité](#1-authentification--sécurité)
2. [Gestion des fichiers](#2-gestion-des-fichiers)
3. [Partage de fichiers](#3-partage-de-fichiers)
4. [Corbeille](#4-corbeille)
5. [Prévisualisation & Commentaires](#5-prévisualisation--commentaires)
6. [Annotations PDF](#6-annotations-pdf)
7. [Comptes invités](#7-comptes-invités)
8. [Équipes](#8-équipes)
9. [Rôles & Permissions](#9-rôles--permissions)
10. [Notifications](#10-notifications)
11. [FinOps & Coûts](#11-finops--coûts)
12. [Stockage & Tiering](#12-stockage--tiering)
13. [Administration](#13-administration)
14. [Email & SMTP](#14-email--smtp)
15. [Rapports](#15-rapports)
16. [Antivirus & Sécurité fichiers](#16-antivirus--sécurité-fichiers)
17. [Audit](#17-audit)
18. [Branding Entreprise](#18-branding-entreprise)
19. [Portail upload externe](#19-portail-upload-externe)
20. [2FA / OTP](#20-2fa--otp)
21. [Entra ID / SSO](#21-entra-id--sso)
22. [Actions en masse (Bulk)](#22-actions-en-masse-bulk)
23. [Responsive / Mobile](#23-responsive--mobile)
24. [Performance & Limites](#24-performance--limites)

---

## 1. Authentification & Sécurité

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 1.1 | Login admin valide | Aucune | POST `/api/admin/login` avec admin/admin123 | Token JWT retourné, redirect vers admin.html | 🔴 Critique |
| 1.2 | Login admin invalide | Aucune | POST `/api/admin/login` avec admin/wrongpass | 401 Unauthorized, message d'erreur | 🔴 Critique |
| 1.3 | Login user valide | Aucune | POST `/api/user/login` avec user/user123 | Token JWT retourné, redirect vers user.html | 🔴 Critique |
| 1.4 | Login user invalide | Aucune | POST `/api/user/login` avec user/wrongpass | 401, pas de token | 🔴 Critique |
| 1.5 | Username case-insensitive | Aucune | Login avec "Admin" ou "ADMIN" | Login réussi (COLLATE NOCASE) | 🟡 Haute |
| 1.6 | Password case-sensitive | Aucune | Login avec admin/Admin123 | 401, login refusé | 🟡 Haute |
| 1.7 | Token expiré | Session active | Attendre expiration ou forger un token expiré | 401, redirect login | 🟡 Haute |
| 1.8 | Accès route admin sans auth | Non connecté | GET `/api/admin/users` sans token | 401 Unauthorized | 🔴 Critique |
| 1.9 | Accès route admin avec token user | Connecté user | GET `/api/admin/users` avec token user | 403 Forbidden | 🔴 Critique |
| 1.10 | Route health publique | Aucune | GET `/api/health` | 200 OK | 🟢 Basse |
| 1.11 | Login invité valide | Invité créé | POST `/api/guest/login` avec email + code | Token retourné, accès guest | 🟡 Haute |
| 1.12 | Login invité expiré | Invité expiré | POST `/api/guest/login` | 401, compte expiré | 🟡 Haute |
| 1.13 | Vérification token admin | Token admin valide | POST `/api/admin/verify` | 200, données user | 🟡 Haute |

---

## 2. Gestion des fichiers

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 2.1 | Upload fichier simple | Connecté user | POST `/api/upload` avec fichier <100Mo | 200, fichier dans Azure, ownership créé | 🔴 Critique |
| 2.2 | Upload multiple | Connecté user | POST `/api/upload/multiple` avec 3 fichiers | 200, 3 fichiers créés | 🟡 Haute |
| 2.3 | Upload fichier trop gros | Connecté user | Upload fichier >100Mo | 413 ou erreur taille | 🟡 Haute |
| 2.4 | Liste fichiers | Connecté user | GET `/api/files` | Liste des fichiers de l'utilisateur | 🔴 Critique |
| 2.5 | Liste fichiers user | Connecté user | GET `/api/user/files` | Arborescence avec dossiers | 🔴 Critique |
| 2.6 | Téléchargement fichier | Fichier existant | GET `/api/download/:blobName` | Stream du fichier, Content-Disposition | 🔴 Critique |
| 2.7 | Suppression fichier | Fichier existant | DELETE `/api/files/:blobName` | Fichier supprimé ou mis en corbeille | 🟡 Haute |
| 2.8 | Création dossier | Connecté user | POST `/api/user/folders/create` | Dossier créé (blob marqueur) | 🟡 Haute |
| 2.9 | Renommer fichier | Fichier existant | PUT `/api/user/files/rename` | Blob renommé, ownership mis à jour | 🟡 Haute |
| 2.10 | Déplacer fichier | Fichier + dossier existants | PUT `/api/user/files/move` | Fichier déplacé dans le dossier | 🟡 Haute |
| 2.11 | Suppression fichier user | Connecté user | DELETE `/api/user/files` | Fichier supprimé/corbeille | 🟡 Haute |
| 2.12 | Upload en tant qu'invité | Connecté guest | POST `/api/upload` avec token guest | Upload autorisé dans le scope invité | 🟡 Haute |

---

## 3. Partage de fichiers

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 3.1 | Générer lien de partage | Fichier existant, connecté | POST `/api/share/generate` avec blobName, password, recipientEmail, expiresIn | Lien créé, linkId retourné | 🔴 Critique |
| 3.2 | Partage sans mot de passe | Fichier existant | POST `/api/share/generate` sans password | 400, mot de passe obligatoire | 🔴 Critique |
| 3.3 | Partage domaine non autorisé | Config domaines | POST `/api/share/generate` avec email@interdit.com | 400, domaine non autorisé | 🟡 Haute |
| 3.4 | Partage domaine autorisé | Config domaines | POST `/api/share/generate` avec email@gmail.com | Lien créé | 🟡 Haute |
| 3.5 | Téléchargement via lien (GET) | Lien actif | GET `/api/share/download/:linkId` | Page de téléchargement | 🔴 Critique |
| 3.6 | Téléchargement via lien (POST) | Lien actif | POST `/api/share/download/:linkId` avec password | Fichier téléchargé | 🔴 Critique |
| 3.7 | Mauvais mot de passe partage | Lien actif | POST `/api/share/download/:linkId` avec mauvais mdp | 401, accès refusé | 🔴 Critique |
| 3.8 | Lien expiré | Lien expiré | POST `/api/share/download/:linkId` | 410 ou 403, lien expiré | 🟡 Haute |
| 3.9 | Compteur téléchargements | Lien actif | Télécharger 3 fois | `download_count` = 3 | 🟢 Basse |
| 3.10 | Envoi email partage | SMTP configuré | POST `/api/share/send-email` | 2 emails envoyés (lien + password séparé) | 🟡 Haute |
| 3.11 | Watermark sur partage | Lien avec watermark | POST `/api/share/download/:linkId` sur PDF/image | Watermark appliqué, original intact | 🟡 Haute |
| 3.12 | Watermark personnalisé | Lien avec texte custom | Télécharger via partage | Texte custom en filigrane | 🟢 Basse |
| 3.13 | Suppression lien partage | Lien existant | DELETE `/api/share/:linkId` | Lien supprimé | 🟡 Haute |
| 3.14 | Historique partages | Partages créés | GET `/api/share/history` | Liste des partages avec stats | 🟢 Basse |
| 3.15 | Info partage fichier | Fichier partagé | GET `/api/share/info/:blobName` | Infos du partage actif | 🟢 Basse |
| 3.16 | Partage dossier (bulk) | Plusieurs fichiers sélectionnés | POST `/api/files/bulk-share` | Lien unique pour tous les fichiers | 🟡 Haute |
| 3.17 | Téléchargement dossier partagé | Lien dossier actif | GET `/api/share/folder/:linkId` | ZIP avec tous les fichiers | 🟡 Haute |
| 3.18 | Liens partage user | Connecté user | GET `/api/user/share-links` | Liste des partages de l'user | 🟡 Haute |
| 3.19 | Suppression lien user | Lien de l'user | DELETE `/api/user/share-links/:linkId` | Lien supprimé | 🟡 Haute |

---

## 4. Corbeille

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 4.1 | Mettre en corbeille | Fichier existant | PUT `/api/files/trash` avec blobName | `is_trashed=1`, blob → Archive tier | 🔴 Critique |
| 4.2 | Lister corbeille | Fichiers en corbeille | GET `/api/files/trash` | Liste des fichiers en corbeille | 🟡 Haute |
| 4.3 | Restaurer fichier | Fichier en corbeille | PUT `/api/files/restore` avec blobName | `is_trashed=0`, blob restauré | 🔴 Critique |
| 4.4 | Restaurer tout | Plusieurs en corbeille | PUT `/api/files/trash/restore-all` | Tous les fichiers restaurés | 🟡 Haute |
| 4.5 | Vider corbeille | Fichiers en corbeille | DELETE `/api/files/trash/empty` | Blobs supprimés définitivement | 🟡 Haute |
| 4.6 | Auto-purge 30 jours | Fichier corbeille >30j | Attendre cron 4:00 AM | Fichier supprimé automatiquement | 🟡 Haute |
| 4.7 | Fichier corbeille invisible | Fichier en corbeille | GET `/api/files` ou `/api/user/files` | Fichier absent de la liste | 🔴 Critique |

---

## 5. Prévisualisation & Commentaires

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 5.1 | Preview image | Image uploadée | GET `/api/preview/:blobName` | Image affichée dans modal | 🟡 Haute |
| 5.2 | Preview PDF | PDF uploadé | GET `/api/preview/:blobName` | PDF affiché inline | 🟡 Haute |
| 5.3 | Preview vidéo | Vidéo uploadée | GET `/api/preview/:blobName` | Player vidéo avec contrôles custom | 🟡 Haute |
| 5.4 | Preview audio | Audio uploadé | GET `/api/preview/:blobName` | Player audio | 🟢 Basse |
| 5.5 | Preview texte/JSON | Fichier texte | GET `/api/preview/:blobName` | Contenu formaté | 🟢 Basse |
| 5.6 | Preview fichier avec / dans nom | Fichier dans sous-dossier | GET `/api/preview/dossier/fichier.pdf` | Preview OK (wildcard route) | 🟡 Haute |
| 5.7 | Ajouter commentaire | Fichier existant | POST `/api/files/:blobName/comments` avec text | Commentaire créé avec auteur + date | 🟡 Haute |
| 5.8 | Lister commentaires | Commentaires existants | GET `/api/files/:blobName/comments` | Liste triée par date | 🟡 Haute |
| 5.9 | Supprimer commentaire (auteur) | Commentaire propre | DELETE `/api/files/comments/:id` | Commentaire supprimé | 🟡 Haute |
| 5.10 | Supprimer commentaire (admin) | Commentaire d'autrui, login admin | DELETE `/api/files/comments/:id` | Commentaire supprimé | 🟡 Haute |
| 5.11 | Supprimer commentaire (non-auteur) | Commentaire d'autrui, login user | DELETE `/api/files/comments/:id` | 403, refusé | 🟡 Haute |
| 5.12 | Commentaire horodaté vidéo | Vidéo en lecture | Commenter avec `[1:30] texte` | Marker orange sur timeline, popup pendant lecture | 🟢 Basse |
| 5.13 | Capture PNG vidéo | Vidéo en lecture | Clic bouton capture | Image PNG téléchargée | 🟢 Basse |
| 5.14 | Vitesse lecture vidéo | Vidéo en lecture | Changer vitesse 0.5x → 2x | Lecture ajustée | 🟢 Basse |

---

## 6. Annotations PDF

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 6.1 | Ouvrir éditeur PDF | PDF uploadé | Ouvrir pdf-annotate.html?file=... | PDF affiché avec barre d'outils | 🟡 Haute |
| 6.2 | Ajouter note texte | PDF ouvert | Sélectionner outil texte, cliquer, taper | Note positionnée sur le PDF | 🟡 Haute |
| 6.3 | Surligner zone | PDF ouvert | Outil highlight, sélectionner zone | Zone surlignée en jaune | 🟡 Haute |
| 6.4 | Dessiner trait libre | PDF ouvert | Outil draw, dessiner | Trait visible | 🟡 Haute |
| 6.5 | Gomme | Annotation existante | Outil eraser, cliquer sur annotation | Annotation supprimée | 🟡 Haute |
| 6.6 | Sauvegarder annotations | Annotations créées | POST `/api/files/:blobName/annotations` | Annotations sauvées en DB (coordonnées %) | 🔴 Critique |
| 6.7 | Charger annotations | Annotations sauvées | GET `/api/files/:blobName/annotations` | Annotations affichées sur le PDF | 🔴 Critique |
| 6.8 | Exporter PDF annoté | Annotations créées | POST `/api/files/:blobName/annotations/export` | PDF avec annotations intégrées (pdf-lib) | 🟡 Haute |
| 6.9 | Supprimer toutes annotations | Annotations existantes | DELETE `/api/files/:blobName/annotations` | Toutes supprimées | 🟡 Haute |
| 6.10 | Couleur et épaisseur trait | PDF ouvert | Changer couleur + épaisseur | Prochaine annotation avec nouveaux paramètres | 🟢 Basse |
| 6.11 | Coordonnées relatives (zoom) | PDF avec annotations | Zoomer/dézoomer | Annotations restent bien placées (% relatif) | 🟡 Haute |

---

## 7. Comptes invités

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 7.1 | Créer invité (3 jours) | Connecté user, domaine autorisé | POST `/api/admin/guest-accounts` durée 3j | Invité actif, code généré, email envoyé | 🔴 Critique |
| 7.2 | Créer invité (illimité, non-admin) | Connecté user | POST durée illimitée | `pending_approval=1`, `is_active=0`, PAS d'email | 🟡 Haute |
| 7.3 | Créer invité (illimité, admin) | Connecté admin | POST durée illimitée | `is_unlimited=1`, actif immédiatement | 🟡 Haute |
| 7.4 | Approuver invité illimité | Admin, invité en attente | PUT `/api/admin/guest-accounts/:id/approve` | `pending_approval=0`, `is_active=1`, email envoyé | 🟡 Haute |
| 7.5 | Domaine email non autorisé | Domaine absent liste | POST créer invité avec email@interdit.com | 400, domaine non approuvé | 🟡 Haute |
| 7.6 | Désactiver invité | Invité actif | PUT `/api/admin/guest-accounts/:id/disable` | `is_active=0` | 🟡 Haute |
| 7.7 | Supprimer invité | Invité existant | DELETE `/api/admin/guest-accounts/:id` | Invité supprimé + fichiers associés | 🟡 Haute |
| 7.8 | Lister mes invités | User avec invités créés | GET `/api/user/my-guests` | Liste invités créés par l'user | 🟡 Haute |
| 7.9 | Supprimer mon invité | Invité propre | DELETE `/api/user/my-guests/:id` | Invité supprimé | 🟡 Haute |
| 7.10 | Durées invité | Aucune | Créer invités 3j/7j/15j/1mois/illimité | Expiration correcte pour chaque durée | 🟡 Haute |
| 7.11 | Login invité code correct | Invité actif | POST `/api/guest/login` email + code | Token, accès autorisé | 🔴 Critique |
| 7.12 | Login invité code incorrect | Invité actif | POST `/api/guest/login` mauvais code | 401 | 🟡 Haute |

---

## 8. Équipes

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 8.1 | Créer équipe | Admin connecté | POST `/api/teams` avec nom | Équipe créée | 🟡 Haute |
| 8.2 | Lister équipes | Équipes existantes | GET `/api/teams` | Liste des équipes (filtrée par rôle) | 🟡 Haute |
| 8.3 | Détail équipe | Équipe existante | GET `/api/teams/:teamId` | Infos complètes + membres | 🟡 Haute |
| 8.4 | Modifier équipe | Owner/admin | PUT `/api/teams/:teamId` | Nom mis à jour | 🟡 Haute |
| 8.5 | Supprimer équipe | Admin | DELETE `/api/teams/:teamId` | Équipe supprimée | 🟡 Haute |
| 8.6 | Ajouter membre | Owner/admin | POST `/api/teams/:teamId/members` | Membre ajouté avec rôle | 🟡 Haute |
| 8.7 | Lister membres | Membre de l'équipe | GET `/api/teams/:teamId/members` | Liste des membres | 🟡 Haute |
| 8.8 | Modifier rôle membre | Owner/admin | PUT `/api/teams/:teamId/members/:userId` | Rôle mis à jour | 🟡 Haute |
| 8.9 | Retirer membre | Owner/admin | DELETE `/api/teams/:teamId/members/:userId` | Membre retiré | 🟡 Haute |
| 8.10 | Upload logo équipe (owner) | Owner de l'équipe | PUT `/api/teams/:teamId/logo` SVG | Logo sauvé, affiché | 🟡 Haute |
| 8.11 | Upload logo équipe (non-owner) | Membre simple | PUT `/api/teams/:teamId/logo` | 403, refusé | 🟡 Haute |
| 8.12 | Upload logo non-SVG | Owner | PUT `/api/teams/:teamId/logo` PNG | 400, SVG uniquement | 🟡 Haute |
| 8.13 | Supprimer logo équipe | Logo existant | DELETE `/api/teams/:teamId/logo` | Logo supprimé | 🟢 Basse |
| 8.14 | Récupérer logo équipe | Logo existant | GET `/api/teams/:teamId/logo` | SVG retourné | 🟢 Basse |

---

## 9. Rôles & Permissions

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 9.1 | Lister rôles | Admin | GET `/api/admin/roles` | 4 rôles : admin, com, user, viewer | 🟡 Haute |
| 9.2 | Voir permissions d'un rôle | Admin | GET `/api/admin/roles/user/permissions` | 11 permissions listées | 🟡 Haute |
| 9.3 | Modifier permissions | Admin | PUT `/api/admin/roles/user/permissions` | Permissions mises à jour | 🟡 Haute |
| 9.4 | Permission canUpload = false | User avec canUpload=0 | POST `/api/upload` | 403, upload refusé | 🔴 Critique |
| 9.5 | Permission canShare = false | User sans canShare | POST `/api/share/generate` | 403, partage refusé | 🔴 Critique |
| 9.6 | Permission canCreateGuests = false | User sans permission | POST `/api/admin/guest-accounts` | 403 | 🟡 Haute |
| 9.7 | Permissions user propres | Connecté user | GET `/api/user/permissions` | Permissions de son rôle | 🟡 Haute |
| 9.8 | Rôle viewer (lecture seule) | Viewer connecté | Tenter upload, partage, suppression | Tout refusé sauf lecture | 🟡 Haute |
| 9.9 | Audit permissions séparées | User sans audit | GET `/api/audit/shares` | 403, accès refusé | 🟡 Haute |

---

## 10. Notifications

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 10.1 | Lister notifications | Connecté | GET `/api/notifications` | Liste des notifs non-lues en premier | 🟡 Haute |
| 10.2 | Marquer lue | Notif non-lue | PUT `/api/notifications/:id/read` | `is_read=1` | 🟡 Haute |
| 10.3 | Marquer toutes lues | Plusieurs non-lues | PUT `/api/notifications/read-all` | Toutes marquées lues | 🟡 Haute |
| 10.4 | Supprimer notification | Notif existante | DELETE `/api/notifications/:id` | Notif supprimée | 🟡 Haute |
| 10.5 | Notif sur partage créé | Fichier partagé | Créer un partage | Notification créée pour l'admin | 🟡 Haute |
| 10.6 | Notif sur upload | Upload fichier | Uploader un fichier | Notification pour les admins | 🟡 Haute |
| 10.7 | Badge cloche (frontend) | Notifs non-lues | Ouvrir page user | Cloche avec badge rouge compteur | 🟡 Haute |
| 10.8 | Polling 30s | Session active | Attendre 30s | Requête auto `/api/notifications` | 🟢 Basse |

---

## 11. FinOps & Coûts

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 11.1 | Dashboard FinOps user | Fichiers uploadés | GET `/api/finops/me` | 4 cartes (stockage, partages, invités, total), breakdown tiers | 🟡 Haute |
| 11.2 | Suggestions optimisation | Fichiers Hot >30j | GET `/api/finops/me` | Suggestions Cool visible | 🟡 Haute |
| 11.3 | Appliquer optimisation | Suggestion disponible | POST `/api/finops/optimize` blobName, targetTier | Tier changé, coût réduit | 🟡 Haute |
| 11.4 | Coûts par utilisateur | Admin | GET `/api/costs/user/:userId` | Détail coûts par tier | 🟡 Haute |
| 11.5 | Coûts par équipe | Admin | GET `/api/costs/team/:teamId` | Coûts agrégés équipe | 🟡 Haute |
| 11.6 | Coûts globaux admin | Admin | GET `/api/admin/costs` | Vue d'ensemble tous coûts | 🟡 Haute |
| 11.7 | Rapport FinOps admin | Admin | GET `/api/admin/finops` | Données FinOps JSON | 🟢 Basse |
| 11.8 | Rapport FinOps HTML | Admin | GET `/api/admin/finops/html` | Page HTML formatée | 🟢 Basse |
| 11.9 | Envoi rapport FinOps | Admin + SMTP | POST `/api/admin/finops/send` | Email envoyé | 🟢 Basse |
| 11.10 | Recalcul FinOps | Admin | POST `/api/admin/finops/recalculate` | Données recalculées | 🟢 Basse |

---

## 12. Stockage & Tiering

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 12.1 | Changer tier (Hot→Cool) | Fichier Hot | POST `/api/files/:blobName/archive` tier=Cool | Blob Azure changé en Cool | 🟡 Haute |
| 12.2 | Changer tier (Cool→Archive) | Fichier Cool | POST `/api/files/:blobName/archive` tier=Archive | Blob archivé | 🟡 Haute |
| 12.3 | Réhydrater fichier | Fichier Archive | POST `/api/files/:blobName/rehydrate` | Processus réhydratation lancé | 🟡 Haute |
| 12.4 | Statut tier | Fichier existant | GET `/api/files/:blobName/tier-status` | Tier actuel + historique | 🟡 Haute |
| 12.5 | Politiques tiering globales | Admin | GET `/api/admin/tiering/policies` | Politique globale retournée | 🟡 Haute |
| 12.6 | Modifier politique globale | Admin | PUT `/api/admin/tiering/global` | Politique mise à jour | 🟡 Haute |
| 12.7 | Politique par équipe | Admin | PUT `/api/admin/tiering/team/:teamId` | Politique équipe créée (prioritaire) | 🟡 Haute |
| 12.8 | Supprimer politique équipe | Admin | DELETE `/api/admin/tiering/team/:teamId` | Retour à politique globale | 🟢 Basse |
| 12.9 | Exécuter tiering manuellement | Admin | POST `/api/admin/tiering/run` | Job tiering exécuté | 🟢 Basse |
| 12.10 | Prévisualiser tiering | Admin | GET `/api/admin/tiering/preview` | Fichiers qui seraient déplacés | 🟢 Basse |
| 12.11 | Sync stockage Azure | Admin | POST `/api/admin/sync-storage` | DB synchronisée avec blobs Azure | 🟡 Haute |
| 12.12 | Arbre stockage | Admin | GET `/api/admin/storage/tree` | Arborescence des fichiers | 🟡 Haute |
| 12.13 | Reset stockage | Admin | POST `/api/admin/reset-storage` (double confirm) | Tous blobs + DB nettoyés | 🔴 Critique |

---

## 13. Administration

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 13.1 | Lister utilisateurs | Admin | GET `/api/admin/users` | Liste complète avec rôles | 🟡 Haute |
| 13.2 | Créer utilisateur | Admin | POST `/api/admin/users` | User créé, hash mdp | 🟡 Haute |
| 13.3 | Modifier utilisateur | Admin | PUT `/api/admin/users/:id` | Infos mises à jour | 🟡 Haute |
| 13.4 | Activer/désactiver user | Admin | PUT `/api/admin/users/:id/activate` | Statut toggled | 🟡 Haute |
| 13.5 | Changer mot de passe user | Admin | PUT `/api/admin/users/:id/password` | Mot de passe modifié | 🟡 Haute |
| 13.6 | Supprimer user (soft) | Admin | DELETE `/api/admin/users/:id` | User désactivé | 🟡 Haute |
| 13.7 | Supprimer user (permanent) | Admin | DELETE `/api/admin/users/:id/permanent` | User + données supprimés | 🔴 Critique |
| 13.8 | Statistiques admin | Admin | GET `/api/admin/stats` | Stats fichiers, users, stockage | 🟡 Haute |
| 13.9 | Logs admin | Admin | GET `/api/admin/logs` | Activity logs paginés | 🟡 Haute |
| 13.10 | Purger logs | Admin | DELETE `/api/admin/logs` | Logs supprimés | 🟢 Basse |
| 13.11 | Paramètres généraux | Admin | GET/PUT `/api/settings` | Lecture/écriture settings | 🟡 Haute |
| 13.12 | Reset paramètres | Admin | POST `/api/settings/reset` | Retour aux valeurs par défaut | 🟢 Basse |
| 13.13 | Domaines email | Admin | GET/POST/DELETE `/api/admin/email-domains` | CRUD domaines autorisés | 🟡 Haute |
| 13.14 | Import bulk domaines | Admin | POST `/api/admin/email-domains/bulk` | Plusieurs domaines ajoutés | 🟢 Basse |
| 13.15 | Recheck domaine | Admin | POST `/api/admin/email-domains/:id/recheck` | DMARC/Whois rechecké | 🟢 Basse |
| 13.16 | Activer/désactiver domaine | Admin | PUT `/api/admin/email-domains/:domain/activate` | Statut modifié | 🟡 Haute |

---

## 14. Email & SMTP

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 14.1 | Config email | Admin | GET `/api/admin/email/config` | Config SMTP actuelle | 🟡 Haute |
| 14.2 | Modifier config email | Admin | PUT `/api/admin/email/config` | Config sauvée | 🟡 Haute |
| 14.3 | Test connexion SMTP | Admin | POST `/api/admin/email/test` | Test OK ou erreur détaillée | 🟡 Haute |
| 14.4 | Envoi email test | Admin | POST `/api/admin/email/send-test` | Email reçu | 🟡 Haute |
| 14.5 | Email partage (lien) | SMTP actif | Partager un fichier avec email | 1er email avec lien + QR | 🟡 Haute |
| 14.6 | Email partage (mdp séparé) | SMTP actif | Partager un fichier | 2ème email 3s après avec mot de passe en vert | 🟡 Haute |
| 14.7 | From Yahoo = compte Yahoo | SMTP Yahoo | Envoyer email | From = laurent_deberti@yahoo.fr | 🟡 Haute |
| 14.8 | Mailjet API fallback | Mailjet configuré | Envoyer email via Mailjet | Email envoyé via API REST | 🟢 Basse |

---

## 15. Rapports

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 15.1 | Générer rapport | Admin | GET `/api/admin/report?period=week` | HTML complet avec stats | 🟡 Haute |
| 15.2 | Télécharger rapport | Admin | GET `/api/admin/report/download?period=month` | Fichier HTML téléchargé | 🟡 Haute |
| 15.3 | Envoyer rapport email | Admin + SMTP | POST `/api/admin/report/send` | Email avec rapport HTML | 🟡 Haute |
| 15.4 | Période jour/semaine/mois | Admin | Tester chaque période | Données filtrées correctement | 🟡 Haute |
| 15.5 | Rapport FinOps | Admin | GET `/api/admin/finops` + `/html` | Données coûts formatées | 🟢 Basse |

---

## 16. Antivirus & Sécurité fichiers

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 16.1 | Scan upload auto | ClamAV actif | Upload fichier sain | Scan OK, fichier accepté | 🔴 Critique |
| 16.2 | Upload fichier infecté | ClamAV actif | Upload EICAR test file | Fichier rejeté, quarantaine | 🔴 Critique |
| 16.3 | Scan manuel admin | Admin, fichier existant | POST `/api/admin/security/scan/:blobName` | Résultat scan retourné | 🟡 Haute |
| 16.4 | Stats scans | Admin | GET `/api/admin/security/scan-stats` | Compteurs scans OK/infectés | 🟡 Haute |
| 16.5 | Quarantaine | Fichier infecté | Vérifier `/tmp/shareazure-quarantine/` | Fichier déplacé en quarantaine | 🟡 Haute |

---

## 17. Audit

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 17.1 | Audit partages | Permission canAuditShares | GET `/api/audit/shares` | Liste tous les partages | 🟡 Haute |
| 17.2 | Partages expirés | Partages expirés | GET `/api/audit/shares/expired` | Liste des expirés | 🟡 Haute |
| 17.3 | Stats partages | Permission audit | GET `/api/audit/shares/stats` | Agrégats par période | 🟡 Haute |
| 17.4 | Révoquer partage | Permission audit | POST `/api/audit/shares/:linkId/revoke` | Lien révoqué | 🟡 Haute |
| 17.5 | Audit fichiers | Permission canAuditFiles | GET `/api/audit/files` | Historique opérations fichiers | 🟡 Haute |
| 17.6 | Audit activité | Permission canAuditActivity | GET `/api/audit/activity` | Logs d'activité complets | 🟡 Haute |
| 17.7 | Audit téléchargements | Permission audit | GET `/api/audit/downloads` | Historique downloads partages | 🟡 Haute |
| 17.8 | Sans permission audit | User sans audit perm | GET `/api/audit/*` | 403 sur toutes les routes | 🟡 Haute |

---

## 18. Branding Entreprise

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 18.1 | Info entreprise | Aucune | GET `/api/company-info` | Nom "APRIL Assurances" | 🟡 Haute |
| 18.2 | Logo entreprise | Logo configuré | GET `/api/company-logo` | SVG retourné | 🟡 Haute |
| 18.3 | Changer logo | Admin | POST `/api/admin/company-logo` SVG | Logo mis à jour | 🟡 Haute |
| 18.4 | Logo non-SVG rejeté | Admin | POST `/api/admin/company-logo` PNG | 400, SVG uniquement | 🟡 Haute |
| 18.5 | Logo visible partout | Logo configuré | Visiter login, user, admin, team, guest | Logo affiché sur toutes les pages | 🟡 Haute |
| 18.6 | Nom entreprise dans header | Nom configuré | Visiter toutes les pages | Nom affiché dans le header | 🟡 Haute |

---

## 19. Portail upload externe

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 19.1 | Créer demande upload | Connecté user | POST `/api/upload-requests` | Request créée, lien public généré | 🟡 Haute |
| 19.2 | Page upload externe | Request valide | GET `/upload/:requestId` | Page drag & drop publique | 🟡 Haute |
| 19.3 | Upload par externe | Lien valide | Upload fichier via formulaire | Fichier uploadé, scan antivirus | 🟡 Haute |
| 19.4 | Upload lien invalide | Request inexistante | GET `/upload/fake-id` | Erreur, lien invalide | 🟡 Haute |
| 19.5 | Upload lien expiré | Request expirée | Tenter upload | Refusé, lien expiré | 🟡 Haute |

---

## 20. 2FA / OTP

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 20.1 | Activer 2FA | Connecté user | PUT `/api/user/2fa` enabled=true | 2FA activé | 🟡 Haute |
| 20.2 | Login avec 2FA | 2FA activé | Login → code OTP email → POST `/api/auth/verify-otp` | Accès après OTP valide | 🔴 Critique |
| 20.3 | OTP incorrect | 2FA activé | POST `/api/auth/verify-otp` mauvais code | 401, accès refusé | 🔴 Critique |
| 20.4 | OTP expiré (>5min) | 2FA activé | Attendre 5min+ puis soumettre | 401, code expiré | 🟡 Haute |
| 20.5 | Désactiver 2FA | 2FA activé | PUT `/api/user/2fa` enabled=false | 2FA désactivé, login direct | 🟡 Haute |
| 20.6 | Statut 2FA | Connecté | GET `/api/user/2fa` | Statut actuel | 🟢 Basse |

---

## 21. Entra ID / SSO

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 21.1 | Initier login Entra | Auth mode Entra/Hybrid | GET `/api/auth/entra/login` | Redirect vers Microsoft login | 🟡 Haute |
| 21.2 | Callback Entra | Login Microsoft réussi | GET `/api/auth/callback` avec code | User créé/connecté, token JWT | 🟡 Haute |
| 21.3 | Auto-create user Entra | Nouveau user Microsoft | Callback SSO | User créé avec rôle par défaut | 🟡 Haute |
| 21.4 | Config auth modes | Admin | GET/PUT `/api/settings/auth` | Mode basculé (local/entra/hybrid) | 🟡 Haute |
| 21.5 | Test connexion Entra | Admin | POST `/api/settings/auth/test` | Test OK ou erreur | 🟡 Haute |
| 21.6 | Role mapping Entra | Admin | GET/PUT `/api/admin/entra/role-mappings` | Mapping groupe→rôle | 🟢 Basse |
| 21.7 | Sync settings Entra | Admin | PUT `/api/admin/entra/sync-settings` | Paramètres sync sauvés | 🟢 Basse |
| 21.8 | Bouton Microsoft visible | Mode Hybrid | Ouvrir login.html | Bouton "Se connecter avec Microsoft" visible | 🟡 Haute |

---

## 22. Actions en masse (Bulk)

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 22.1 | Téléchargement ZIP | ≥2 fichiers sélectionnés | POST `/api/files/bulk-download` | ZIP contenant les fichiers | 🟡 Haute |
| 22.2 | Suppression en masse | ≥2 fichiers sélectionnés | POST `/api/files/bulk-delete` | Tous en corbeille | 🟡 Haute |
| 22.3 | Partage en masse | ≥2 fichiers sélectionnés | POST `/api/files/bulk-share` | 1 lien pour tout | 🟡 Haute |
| 22.4 | Select all / Deselect | Fichiers listés | Clic "Tout sélectionner" | Tous cochés/décochés | 🟢 Basse |
| 22.5 | Barre actions bulk visible | ≥1 fichier coché | Cocher un fichier | Barre d'actions apparaît | 🟢 Basse |

---

## 23. Responsive / Mobile

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 23.1 | Login mobile | Écran <768px | Ouvrir login.html | Formulaire lisible, pas de scroll horizontal | 🟡 Haute |
| 23.2 | User page mobile | Écran <768px | Ouvrir user.html | Tableau scrollable, menu hamburger | 🟡 Haute |
| 23.3 | Admin page mobile | Écran <768px | Ouvrir admin.html | Hamburger menu, tableau responsive | 🟡 Haute |
| 23.4 | Team page mobile | Écran <768px | Ouvrir team.html | Navigation mobile, contenu lisible | 🟡 Haute |
| 23.5 | Preview modal mobile | Écran <768px | Ouvrir preview d'un fichier | Modal plein écran, boutons accessibles | 🟡 Haute |
| 23.6 | Menus contextuels mobile | Écran <768px | Clic ⋯ sur fichier | Menu positionné correctement (position: fixed) | 🟡 Haute |
| 23.7 | Upload mobile | Écran <768px | Upload fichier | Drag & drop ou sélection fichier fonctionne | 🟡 Haute |

---

## 24. Performance & Limites

| # | Cas de test | Pré-conditions | Étapes | Résultat attendu | Priorité |
|---|------------|----------------|--------|-------------------|----------|
| 24.1 | Upload 100 Mo | Fichier 100 Mo | Upload via interface | Upload réussi ou erreur claire si dépassé | 🟡 Haute |
| 24.2 | Upload 10 fichiers simultanés | 10 fichiers | POST `/api/upload/multiple` | Tous uploadés (max 10) | 🟡 Haute |
| 24.3 | 1000 fichiers dans liste | 1000 fichiers en DB | GET `/api/files` | Réponse <3s, pagination fonctionnelle | 🟢 Basse |
| 24.4 | ZIP gros dossier | 20 fichiers, 500 Mo total | POST `/api/files/bulk-download` | ZIP généré, timeout OK | 🟢 Basse |
| 24.5 | Connexions concurrentes | 5 users simultanés | 5 sessions parallèles | Pas de blocage, pas de corruption DB | 🟢 Basse |
| 24.6 | ClamAV timeout | Gros fichier (>1 Go) | Upload fichier volumineux | Scan terminé ou timeout géré proprement | 🟢 Basse |

---

## Récapitulatif

| Catégorie | Tests | 🔴 Critique | 🟡 Haute | 🟢 Basse |
|-----------|-------|-------------|----------|----------|
| 1. Authentification | 13 | 5 | 7 | 1 |
| 2. Gestion fichiers | 12 | 3 | 9 | 0 |
| 3. Partage | 19 | 4 | 11 | 4 |
| 4. Corbeille | 7 | 3 | 4 | 0 |
| 5. Preview & Commentaires | 14 | 0 | 9 | 5 |
| 6. Annotations PDF | 11 | 2 | 7 | 2 |
| 7. Invités | 12 | 2 | 10 | 0 |
| 8. Équipes | 14 | 0 | 12 | 2 |
| 9. Rôles & Permissions | 9 | 2 | 7 | 0 |
| 10. Notifications | 8 | 0 | 7 | 1 |
| 11. FinOps | 10 | 0 | 6 | 4 |
| 12. Stockage & Tiering | 13 | 1 | 8 | 4 |
| 13. Administration | 16 | 1 | 12 | 3 |
| 14. Email | 8 | 0 | 7 | 1 |
| 15. Rapports | 5 | 0 | 4 | 1 |
| 16. Antivirus | 5 | 2 | 3 | 0 |
| 17. Audit | 8 | 0 | 8 | 0 |
| 18. Branding | 6 | 0 | 6 | 0 |
| 19. Portail externe | 5 | 0 | 5 | 0 |
| 20. 2FA/OTP | 6 | 2 | 3 | 1 |
| 21. Entra ID/SSO | 8 | 0 | 6 | 2 |
| 22. Bulk Actions | 5 | 0 | 3 | 2 |
| 23. Responsive | 7 | 0 | 7 | 0 |
| 24. Performance | 6 | 0 | 2 | 4 |
| **TOTAL** | **227** | **27** | **163** | **37** |

---

## Environnement de test

| Élément | Valeur |
|---------|--------|
| URL | https://shareazure.deberti.fr |
| Backend | Node.js Express (port 3000 via Nginx) |
| Base de données | better-sqlite3 (`backend/shareazure.db`) |
| Stockage | Azure Blob Storage (`sastshareazure`, container `uploads`) |
| Antivirus | ClamAV daemon (`clamdscan`) |
| SMTP | Yahoo (`smtp.mail.yahoo.com:465`) + Mailjet API |
| Tunnel | Cloudflare (permanent, systemd) |
| Comptes | admin/admin123 (ID:1), user/user123 (ID:2), april→com (ID:3) |
| Fichier test virus | EICAR (`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`) |

---

## Priorité d'exécution

1. **Phase 1 — Critiques** (27 tests) : Auth, upload, partage mdp obligatoire, corbeille, antivirus, 2FA
2. **Phase 2 — Hautes** (163 tests) : Tous les flows fonctionnels principaux
3. **Phase 3 — Basses** (37 tests) : Performance, edge cases, UI polish

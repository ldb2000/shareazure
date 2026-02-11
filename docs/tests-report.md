# Rapport de Tests - ShareAzure Backend

**Date d'execution :** 2026-02-11 07:13:09 UTC
**Environnement :** Node.js / Jest 30.2.0 + Supertest 7.2.2
**Commande :** `npm test` (`jest --forceExit --detectOpenHandles`)
**Commit :** `e444d0d` — Add AI/multimedia analysis module inspired by Wasabi AiR
**Branche :** `main`
**Duree totale :** 5.978 s

---

## Resultat Global

| Metrique | Valeur |
|----------|--------|
| **Test Suites** | **12 passed**, 12 total |
| **Tests** | **143 passed**, 143 total |
| **Snapshots** | 0 total |
| **Echecs** | **0** |

---

## Detail par Suite de Tests

### 1. health.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | GET /api/health — should return status OK | 14 ms | PASS |
| 2 | GET /api/logo-april.svg — should return 404 or SVG depending on file presence | 7 ms | PASS |
| 3 | POST /api/container/init — should initialize container successfully | 3 ms | PASS |

### 2. auth.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/admin/login — should login admin with valid credentials | 79 ms | PASS |
| 2 | POST /api/admin/login — should reject invalid password | 94 ms | PASS |
| 3 | POST /api/admin/login — should reject non-admin user | 5 ms | PASS |
| 4 | POST /api/admin/login — should reject missing credentials | 4 ms | PASS |
| 5 | POST /api/admin/login — should reject nonexistent user | 5 ms | PASS |
| 6 | POST /api/admin/verify — should verify valid admin token | 4 ms | PASS |
| 7 | POST /api/admin/verify — should reject non-admin token | 4 ms | PASS |
| 8 | POST /api/admin/verify — should reject invalid token | 4 ms | PASS |
| 9 | POST /api/admin/verify — should reject missing token | 3 ms | PASS |
| 10 | POST /api/user/login — should login user with valid credentials | 81 ms | PASS |
| 11 | POST /api/user/login — should reject invalid credentials | 76 ms | PASS |
| 12 | POST /api/user/login — should login april_user | 77 ms | PASS |
| 13 | POST /api/user/verify — should verify valid user token | 4 ms | PASS |
| 14 | POST /api/user/verify — should reject invalid token | 4 ms | PASS |

### 3. files.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/upload — should upload a file with valid auth | 9 ms | PASS |
| 2 | POST /api/upload — should reject upload without auth | 5 ms | PASS |
| 3 | POST /api/upload — should reject upload without file | 5 ms | PASS |
| 4 | POST /api/upload — should allow guest upload with valid guest token | 4 ms | PASS |
| 5 | POST /api/upload/multiple — should upload multiple files with valid auth | 9 ms | PASS |
| 6 | POST /api/upload/multiple — should reject multiple upload without auth | 4 ms | PASS |
| 7 | GET /api/files — should list files with valid auth | 7 ms | PASS |
| 8 | GET /api/files — should reject listing without auth | 4 ms | PASS |
| 9 | GET /api/download/:blobName — should download a file | 8 ms | PASS |
| 10 | GET /api/preview/:blobName — should preview a file | 7 ms | PASS |
| 11 | DELETE /api/files/:blobName — should delete a file with valid user auth | 4 ms | PASS |
| 12 | DELETE /api/files/:blobName — should reject delete without auth | 5 ms | PASS |

### 4. share.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/share/generate — should generate a share link | 36 ms | PASS |
| 2 | POST /api/share/generate — should generate a share link with password | 81 ms | PASS |
| 3 | POST /api/share/generate — should reject without blobName | 5 ms | PASS |
| 4 | POST /api/share/generate — should reject without recipientEmail | 5 ms | PASS |
| 5 | POST /api/share/generate — should reject invalid email format | 7 ms | PASS |
| 6 | POST /api/share/generate — should reject unauthorized email domain | 5 ms | PASS |
| 7 | POST /api/share/download/:linkId — should reject without password when required | 4 ms | PASS |
| 8 | POST /api/share/download/:linkId — should reject with wrong password | 75 ms | PASS |
| 9 | POST /api/share/download/:linkId — should reject unauthorized email | 9 ms | PASS |
| 10 | POST /api/share/download/:linkId — should return 404 for nonexistent link | 4 ms | PASS |
| 11 | GET /api/share/info/:blobName — should return file info | 4 ms | PASS |
| 12 | GET /api/share/history — should return share history | 4 ms | PASS |
| 13 | GET /api/share/history — should filter by blobName | 5 ms | PASS |
| 14 | GET /api/share/stats/:linkId — should return stats for a valid link | 4 ms | PASS |
| 15 | GET /api/share/stats/:linkId — should return 404 for nonexistent link | 3 ms | PASS |
| 16 | DELETE /api/share/:linkId — should revoke a share link | 4 ms | PASS |
| 17 | DELETE /api/share/:linkId — should return 404 for nonexistent link | 4 ms | PASS |

### 5. settings.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | GET /api/settings — should return all settings | 7 ms | PASS |
| 2 | GET /api/settings/:key — should return a specific setting | 4 ms | PASS |
| 3 | GET /api/settings/:key — should return 404 for nonexistent setting | 7 ms | PASS |
| 4 | PUT /api/settings — should update settings | 9 ms | PASS |
| 5 | PUT /api/settings — should handle non-object body gracefully | 4 ms | PASS |
| 6 | POST /api/settings/reset — should reset settings to defaults | 15 ms | PASS |

### 6. email-domains.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | GET /api/admin/email-domains — should return email domains list | 7 ms | PASS |
| 2 | POST /api/admin/email-domains — should add a new email domain | 15 ms | PASS |
| 3 | POST /api/admin/email-domains — should reject duplicate domain | 21 ms | PASS |
| 4 | POST /api/admin/email-domains — should reject missing domain | 4 ms | PASS |
| 5 | DELETE /api/admin/email-domains/:domain — should delete an email domain | 10 ms | PASS |
| 6 | PUT /api/admin/email-domains/:domain/activate — should activate an email domain | 14 ms | PASS |
| 7 | PUT /api/admin/email-domains/:domain/deactivate — should deactivate an email domain | 10 ms | PASS |

### 7. guest-accounts.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/admin/guest-accounts — should create a guest account with admin auth | 79 ms | PASS |
| 2 | POST /api/admin/guest-accounts — should create a guest account with april_user auth | 76 ms | PASS |
| 3 | POST /api/admin/guest-accounts — should reject with regular user auth | 6 ms | PASS |
| 4 | POST /api/admin/guest-accounts — should reject without auth | 4 ms | PASS |
| 5 | POST /api/admin/guest-accounts — should reject invalid email | 4 ms | PASS |
| 6 | GET /api/admin/guest-accounts — should list guest accounts with admin auth | 4 ms | PASS |
| 7 | GET /api/admin/guest-accounts — should list guest accounts with april_user auth | 3 ms | PASS |
| 8 | GET /api/admin/guest-accounts — should reject with regular user auth | 3 ms | PASS |
| 9 | POST /api/guest/login — should reject with wrong code | 76 ms | PASS |
| 10 | POST /api/guest/login — should reject missing fields | 4 ms | PASS |
| 11 | POST /api/guest/login — should reject nonexistent email | 4 ms | PASS |
| 12 | PUT /api/admin/guest-accounts/:guestId/disable — should disable a guest account | 9 ms | PASS |
| 13 | DELETE /api/admin/guest-accounts/:guestId — should delete a guest account with admin auth | 6 ms | PASS |
| 14 | DELETE /api/admin/guest-accounts/:guestId — should return 404 for nonexistent guest | 3 ms | PASS |

### 8. user-files.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | GET /api/user/files — should return user files with valid auth | 4 ms | PASS |
| 2 | GET /api/user/files — should reject without auth | 3 ms | PASS |
| 3 | GET /api/user/files — should support path query parameter | 5 ms | PASS |
| 4 | POST /api/user/folders/create — should create a folder with valid auth | 6 ms | PASS |
| 5 | PUT /api/user/files/rename — should attempt to rename a file | 4 ms | PASS |
| 6 | PUT /api/user/files/move — should attempt to move a file | 5 ms | PASS |
| 7 | DELETE /api/user/files — should attempt to delete a user file | 4 ms | PASS |
| 8 | DELETE /api/user/files — should reject without auth | 4 ms | PASS |
| 9 | GET /api/user/share-links — should return user share links with valid auth | 4 ms | PASS |
| 10 | GET /api/user/share-links — should reject without auth | 4 ms | PASS |
| 11 | DELETE /api/user/share-links/:linkId — should attempt to delete a share link | 3 ms | PASS |
| 12 | DELETE /api/user/share-links/:linkId — should reject without auth | 3 ms | PASS |

### 9. teams.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/teams — should create a team with admin auth | 9 ms | PASS |
| 2 | POST /api/teams — should reject without admin auth | 6 ms | PASS |
| 3 | POST /api/teams — should reject missing required fields | 5 ms | PASS |
| 4 | POST /api/teams — should reject duplicate team name | 4 ms | PASS |
| 5 | GET /api/teams — should list teams with user auth | 4 ms | PASS |
| 6 | GET /api/teams — should reject without auth | 4 ms | PASS |
| 7 | GET /api/teams/:teamId — should get team details | 3 ms | PASS |
| 8 | GET /api/teams/:teamId — should return 404 for nonexistent team | 4 ms | PASS |
| 9 | PUT /api/teams/:teamId — should update team with admin auth | 6 ms | PASS |
| 10 | POST /api/teams/:teamId/members — should add a member to the team | 5 ms | PASS |
| 11 | POST /api/teams/:teamId/members — should reject non-admin/non-owner adding members | 4 ms | PASS |
| 12 | GET /api/teams/:teamId/members — should list team members | 4 ms | PASS |
| 13 | PUT /api/teams/:teamId/members/:userId — should change member role | 5 ms | PASS |
| 14 | DELETE /api/teams/:teamId/members/:userId — should remove a member from the team | 4 ms | PASS |
| 15 | DELETE /api/teams/:teamId — should delete team with admin auth | 5 ms | PASS |
| 16 | DELETE /api/teams/:teamId — should reject without admin auth | 3 ms | PASS |

### 10. costs.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | GET /api/costs/user/:userId — should return own costs for authenticated user | 7 ms | PASS |
| 2 | GET /api/costs/user/:userId — should return any user costs for admin | 4 ms | PASS |
| 3 | GET /api/costs/user/:userId — should reject non-admin accessing other user costs | 3 ms | PASS |
| 4 | GET /api/costs/user/:userId — should reject without auth | 5 ms | PASS |
| 5 | GET /api/costs/user/:userId — should support period query parameter | 3 ms | PASS |
| 6 | GET /api/costs/team/:teamId — should return team costs for authenticated user | 4 ms | PASS |
| 7 | GET /api/costs/team/:teamId — should reject without auth | 4 ms | PASS |
| 8 | GET /api/admin/costs — should return global costs for admin | 4 ms | PASS |
| 9 | GET /api/admin/costs — should reject non-admin | 6 ms | PASS |
| 10 | GET /api/admin/costs — should reject without auth | 3 ms | PASS |

### 11. storage-tiers.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | POST /api/files/:blobName/archive — should archive a file to Cool tier | 11 ms | PASS |
| 2 | POST /api/files/:blobName/archive — should archive a file to Archive tier with admin | 5 ms | PASS |
| 3 | POST /api/files/:blobName/archive — should reject invalid tier | 6 ms | PASS |
| 4 | POST /api/files/:blobName/archive — should reject without auth | 4 ms | PASS |
| 5 | POST /api/files/:blobName/archive — should return 404 for nonexistent file | 4 ms | PASS |
| 6 | POST /api/files/:blobName/rehydrate — should rehydrate a file to Hot tier | 5 ms | PASS |
| 7 | POST /api/files/:blobName/rehydrate — should reject invalid target tier | 5 ms | PASS |
| 8 | POST /api/files/:blobName/rehydrate — should reject invalid priority | 4 ms | PASS |
| 9 | POST /api/files/:blobName/rehydrate — should reject without auth | 4 ms | PASS |
| 10 | GET /api/files/:blobName/tier-status — should return tier status for a file | 3 ms | PASS |
| 11 | GET /api/files/:blobName/tier-status — should return 404 for nonexistent file | 4 ms | PASS |
| 12 | GET /api/files/:blobName/tier-status — should reject without auth | 4 ms | PASS |

### 12. integration.test.js — PASS

| # | Test | Duree | Statut |
|---|------|-------|--------|
| 1 | User Workflow — Step 1: User should login | 86 ms | PASS |
| 2 | User Workflow — Step 2: User should upload a file | 17 ms | PASS |
| 3 | User Workflow — Step 3: User should generate a share link | 8 ms | PASS |
| 4 | User Workflow — Step 4: Share link should appear in history | 4 ms | PASS |
| 5 | User Workflow — Step 5: Share link should have stats | 4 ms | PASS |
| 6 | Admin Workflow — Step 1: Admin should login | 78 ms | PASS |
| 7 | Admin Workflow — Step 2: Admin should verify token | 4 ms | PASS |
| 8 | Admin Workflow — Step 3: Admin should view settings | 4 ms | PASS |
| 9 | Admin Workflow — Step 4: Admin should update a setting | 9 ms | PASS |
| 10 | Admin Workflow — Step 5: Admin should manage email domains | 10 ms | PASS |
| 11 | Admin Workflow — Step 6: Admin should view global costs | 4 ms | PASS |
| 12 | Guest Workflow — Step 1: Admin creates guest account | 77 ms | PASS |
| 13 | Guest Workflow — Step 2: Guest appears in list | 5 ms | PASS |
| 14 | Guest Workflow — Step 3: Guest login with wrong code fails | 75 ms | PASS |
| 15 | Team Workflow — Step 1: Admin creates team | 6 ms | PASS |
| 16 | Team Workflow — Step 2: Admin adds member | 6 ms | PASS |
| 17 | Team Workflow — Step 3: Members are listed | 3 ms | PASS |
| 18 | Team Workflow — Step 4: Admin updates team | 5 ms | PASS |
| 19 | Team Workflow — Step 5: Admin removes member | 6 ms | PASS |
| 20 | Team Workflow — Step 6: Admin deletes team | 6 ms | PASS |

---

## Couverture par Domaine Fonctionnel

| Domaine | Tests | Statut |
|---------|-------|--------|
| Health & Static | 3 | PASS |
| Authentification (admin, user, april_user) | 14 | PASS |
| Upload / Gestion fichiers | 12 | PASS |
| Liens de partage | 17 | PASS |
| Settings | 6 | PASS |
| Domaines email | 7 | PASS |
| Comptes invites | 14 | PASS |
| Fichiers utilisateur | 12 | PASS |
| Equipes | 16 | PASS |
| Couts | 10 | PASS |
| Storage Tiers (archivage/rehydratation) | 12 | PASS |
| Integration (workflows E2E) | 20 | PASS |
| **Total** | **143** | **PASS** |

---

## Avertissements Connus (non-bloquants)

### 1. Open Handles (24 instances)
Les `setInterval()` dans `database.js` (lignes 641 et 654) pour le nettoyage periodique des liens expires et des comptes invites generent des warnings "open handles". Ces timers sont normaux en production et sont geres par `--forceExit` dans les tests.

### 2. Configuration SMTP manquante
`emailService.js:19` — Configuration SMTP absente en environnement de test. Les emails ne sont pas envoyes (comportement attendu).

### 3. "Cannot log after tests are done"
Les hash bcrypt pour le mot de passe admin sont generes de maniere asynchrone au chargement du module (`server.js:2084`). Le log peut arriver apres la fin des tests dans certaines suites. Sans impact sur les resultats.

---

## Contexte de l'Execution

Ce rapport a ete genere apres l'ajout du module AI/Multimedia (`backend/ai/`) comprenant :
- 10 nouveaux fichiers de services IA
- 9 nouvelles tables SQLite + index FTS5
- 20 nouveaux parametres AI dans la table `settings`
- 31 nouveaux endpoints API (`/api/ai/` et `/api/admin/ai/`)
- Hook auto-analyze optionnel sur l'upload de fichiers

**Les 143 tests existants couvrant les 56+ endpoints originaux passent tous sans regression.**

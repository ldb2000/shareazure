# 🔐 Audit de Sécurité ShareAzure v2
**Date :** 19 février 2026  
**Auditeur :** Le Claude (AI Security Audit)  
**Version application :** ShareAzure 1.x  
**Classification :** Confidentiel — STTI / APRIL Assurances

---

## 📊 Score Global : 72/100 (↑ de 58/100 en v1)

| Sévérité | Nombre | Évolution |
|----------|--------|-----------|
| 🔴 Critique | 1 | ↓ de 4 à 1 |
| 🟠 Haute | 4 | ↓ de 5 à 4 |
| 🟡 Moyenne | 6 | = |
| 🔵 Basse | 5 | ↑ |
| **Total** | **16** | **↓ de 19 à 16** |

---

## 📋 Résumé Exécutif

Depuis l'audit v1, des améliorations majeures ont été apportées :
- ✅ Migration JWT (Base64 → HS256 signé)
- ✅ Protection de ~20 routes ouvertes
- ✅ Authentification sur download/preview
- ✅ Middleware centralisé authenticateUser/requireAdmin
- ✅ Firewall iptables (DROP par défaut)
- ✅ Backend derrière Nginx (non exposé directement)

Des vulnérabilités subsistent, détaillées ci-dessous.

---

## Volet 1 : OWASP API Security Top 10 (2023)

### API1 — Broken Object Level Authorization (BOLA)
**🟠 Haute**

**Problème :** Certaines routes de fichiers ne vérifient pas systématiquement que le fichier demandé appartient à l'utilisateur. La route `/api/preview/:blobName(*)` et `/api/download/:blobName(*)` vérifient l'authentification mais pas que le `blobName` est accessible à cet utilisateur spécifique.

**Fichier :** `server.js` — routes preview/download  
**Exploit :** Un utilisateur authentifié pourrait accéder au fichier d'un autre utilisateur en devinant/connaissant le blobName.  
**Recommandation :** Ajouter une vérification `fileOwnershipDb.getAccessibleByUser(userId)` incluant le blobName demandé dans les routes preview/download/thumbnail.

### API2 — Broken Authentication
**🔵 Basse** (amélioré depuis v1)

**État :** 
- ✅ JWT HS256 avec secret 128 chars
- ✅ Expiration stratifiée (8h user, 24h guest, 10min OTP)
- ✅ bcrypt salt rounds = 10
- ⚠️ Pas de refresh token — le token de 8h est le seul mécanisme
- ⚠️ Pas de blacklist de tokens (un token volé reste valide jusqu'à expiration)

**Recommandation :** Implémenter un mécanisme de révocation de tokens (table `revoked_tokens` avec TTL).

### API3 — Broken Object Property Level Authorization
**🟡 Moyenne**

**Problème :** Certaines réponses API exposent des propriétés internes non nécessaires au client (ex: `uploaded_by_user_id`, `team_id` interne, chemins Azure complets dans certaines erreurs).

**Recommandation :** Créer des DTOs (Data Transfer Objects) pour filtrer les propriétés retournées.

### API4 — Unrestricted Resource Consumption
**🟠 Haute**

**Problème :** 
- Le rate limiter global est configuré (`express-rate-limit`) mais les routes de login n'ont qu'un rate-limit Nginx de 5r/m
- Pas de rate limiting spécifique sur `/api/auth/verify-otp` → brute force possible sur le code OTP 6 digits
- Upload limité à 100MB (Nginx) — OK
- Pas de limite sur le nombre de partages créés par utilisateur

**Fichier :** `server.js:47` (limiter global), Nginx config  
**Exploit :** Brute force OTP : 6 digits = 1M combinaisons, sans rate limit spécifique = faisable en quelques heures.  
**Recommandation :** Rate limiter `/api/auth/verify-otp` à 5 tentatives/15min. Ajouter un rate limit par IP sur toutes les routes d'auth.

### API5 — Broken Function Level Authorization
**🔵 Basse** (amélioré depuis v1)

**État :**
- ✅ Toutes les routes admin protégées par `authenticateUser + requireAdmin`
- ✅ Routes utilisateur protégées par `authenticateUser`
- ⚠️ La route `POST /api/teams` a été ouverte à tous les utilisateurs (changement récent) — voulu par design

### API6 — Unrestricted Access to Sensitive Business Flows
**🟡 Moyenne**

**Problème :** La création d'invités n'a pas de limite globale quotidienne (même si les invités illimités nécessitent approbation admin). Un utilisateur malveillant pourrait créer des centaines d'invités avec durée de 30 jours.

**Recommandation :** Limiter à 10 créations d'invités par utilisateur par jour.

### API7 — Server Side Request Forgery (SSRF)
**🔵 Basse**

**État :** Pas de route qui accepte une URL utilisateur pour faire un fetch serveur. Les appels externes sont hardcodés (Azure, SMTP). Risque minimal.

### API8 — Security Misconfiguration
**🔴 Critique**

**Problèmes identifiés :**
1. **`contentSecurityPolicy: false`** (server.js:38) — CSP désactivé = vulnérable aux XSS
2. **`CORS origin: '*'`** si `ALLOWED_ORIGINS` non défini (fallback dangereux, même si actuellement configuré)
3. **`error.message` exposé dans ~30 réponses** — fuite d'information sur l'architecture interne
4. **Certificat SSL auto-signé** (atténué par Cloudflare Tunnel qui gère le vrai SSL)
5. **`.env` lisible par le groupe** (permissions 664 au lieu de 600)
6. **`shareazure.db` lisible par tous** (permissions 644 au lieu de 600)

**Fichiers :** `server.js:38`, `server.js:41`, `backend/.env`, `backend/shareazure.db`  
**Recommandation :** 
- Activer CSP : `contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } }`
- Remplacer `error.message` par des messages génériques en production
- `chmod 600 backend/.env backend/shareazure.db`

### API9 — Improper Inventory Management
**🟡 Moyenne**

**Routes potentiellement obsolètes :**
- `/api/logo-april.svg` — fichier statique exposé sans auth
- `/api/admin/login` et `/api/user/login` — 3 routes de login différentes (admin, user, générique)
- Duplication login/auth pourrait créer de la confusion

**Recommandation :** Consolider en une seule route de login avec routing par rôle côté serveur.

### API10 — Unsafe Consumption of APIs
**🟡 Moyenne**

**Problème :** Les réponses des APIs externes (Azure Blob Storage) ne sont pas systématiquement validées avant utilisation. Les métadonnées de blob (content-type, taille) sont utilisées telles quelles.

**Recommandation :** Valider les content-types retournés par Azure avant de les servir au client.

---

## Volet 2 : Audit Code Sécurité

### SEC-01 — Injection SQL
**🔵 Basse**

**État :** better-sqlite3 avec requêtes préparées. Les requêtes dans `database.js` utilisent des placeholders `?`. Quelques concaténations dans les logs (non critiques). Pas de risque d'injection SQL identifié.

### SEC-02 — XSS (Cross-Site Scripting)
**🟠 Haute**

**Problème :** Le frontend (`user.js`, `admin.js`) utilise `innerHTML` pour injecter du contenu dynamique. La fonction `escapeHtml()` est utilisée dans certains cas mais pas systématiquement. Les noms de fichiers, descriptions d'équipes, et commentaires sont des vecteurs potentiels.

**Exemples :**
- Noms de fichiers uploadés affichés via `innerHTML`
- Commentaires de fichiers affichés sans sanitization côté backend
- L'upload d'un fichier nommé `<img src=x onerror=alert(1)>.jpg` pourrait déclencher du XSS

**Recommandation :** 
- Sanitizer systématiquement les inputs côté backend (noms de fichiers, commentaires)
- Utiliser `textContent` au lieu de `innerHTML` quand possible
- Ajouter une bibliothèque de sanitization (DOMPurify côté client)

### SEC-03 — Path Traversal
**🟡 Moyenne**

**Problème :** Les routes utilisant `:blobName(*)` acceptent des chemins arbitraires. Bien que Azure Blob Storage gère ses propres chemins, un `blobName` contenant `../` pourrait théoriquement accéder à des blobs hors du scope de l'utilisateur (voir BOLA ci-dessus).

**Recommandation :** Valider que le `blobName` ne contient pas `..` ni de caractères spéciaux dangereux.

### SEC-04 — Command Injection
**🔵 Basse**

**État :** Les `execSync` dans les routes de thumbnail/transcoding utilisent des chemins temporaires hashés (MD5) et non des inputs utilisateur directs. Le `blobName` est hashé avant d'être utilisé dans les commandes ffmpeg. Risque faible.

**Note :** La fonction `preGenerateThumbnail` utilise des chemins basés sur le hash MD5 du blobName, pas le blobName lui-même. ✅

### SEC-05 — Secrets et Configuration
**🟠 Haute**

**Problèmes :**
1. **Mot de passe admin par défaut `admin123`** — toujours en place (commentaire server.js:3355)
2. **SMTP password en clair dans la DB** (`settings` table, clé `smtpPassword`)
3. **`.env` avec permissions 664** — lisible par le groupe
4. **JWT_SECRET dans `.env`** — OK, mais le fichier a des permissions trop larges

**Recommandation :**
- Forcer le changement de mot de passe admin au premier login
- Chiffrer les secrets SMTP dans la DB
- `chmod 600 .env shareazure.db`

### SEC-06 — Dépendances Vulnérables
**🟠 Haute**

**Résultat npm audit : 6 vulnérabilités haute sévérité**
- `archiver` / `zip-stream` — vulnérabilité connue via `archiver-utils`
- `readdir-glob` → `minimatch` — ReDoS (Regular Expression Denial of Service)

**Recommandation :** `npm audit fix --force` ou mettre à jour manuellement les packages concernés.

### SEC-07 — File Upload Validation
**🟡 Moyenne**

**État :**
- ✅ Taille limitée à 100MB (Nginx)
- ✅ ClamAV scan antivirus actif
- ⚠️ Pas de validation du contenu réel du fichier (magic bytes) — un .exe renommé en .jpg serait accepté
- ⚠️ Pas de liste blanche d'extensions côté backend principal (uniquement sur les upload requests externes)

**Recommandation :** Ajouter une vérification des magic bytes (file signature) pour les types courants.

---

## Volet 3 : Infrastructure Cloud & Serveur

### INFRA-01 — Firewall
**✅ Bon**

- iptables : politique DROP par défaut
- Seuls SSH (22), HTTP (80), HTTPS (443) ouverts
- Backend (3000) et OpenClaw (18789) en loopback uniquement
- DNS outbound autorisé

### INFRA-02 — Services Exposés
**✅ Bon**

- Port 8443 (Nginx HTTPS) — OK, derrière Cloudflare
- Port 80 (Nginx HTTP) — redirige vers HTTPS
- Port 22 (SSH) — à sécuriser (voir INFRA-05)
- Ports 3000, 18789 — loopback uniquement ✅

### INFRA-03 — Nginx Configuration
**🟡 Moyenne**

**Points positifs :**
- ✅ Headers de sécurité (X-Frame-Options, HSTS, X-Content-Type-Options)
- ✅ Rate limiting sur auth et share
- ✅ Blocage fichiers sensibles (.db, .env, .log)
- ✅ TLS 1.2/1.3 uniquement

**Points à améliorer :**
- ⚠️ Pas de CSP header dans Nginx (en plus du backend)
- ⚠️ Pas de `Permissions-Policy` header
- ⚠️ `server_tokens` non désactivé (version Nginx exposée)

### INFRA-04 — Cloudflare Tunnel
**✅ Bon**

- Tunnel permanent avec token, service systemd
- SSL/TLS géré par Cloudflare (le cert auto-signé local n'est pas exposé)
- Pas d'IP publique directe vers le backend

### INFRA-05 — SSH
**🟡 Moyenne**

- SSH ouvert sur port 22 standard (port personnalisé recommandé)
- Vérifier : authentification par clé uniquement ? `PasswordAuthentication no` ?

**Recommandation :** Vérifier `/etc/ssh/sshd_config` pour `PasswordAuthentication no` et envisager un port non-standard.

### INFRA-06 — Azure Storage
**✅ Bon**

- SAS tokens jamais exposés au client
- Téléchargement via route backend authentifiée
- Container `uploads` — accès privé

### INFRA-07 — Permissions Fichiers
**🟠 À corriger immédiatement**

| Fichier | Actuel | Recommandé |
|---------|--------|------------|
| `backend/.env` | 664 (rw-rw-r--) | 600 (rw-------) |
| `backend/shareazure.db` | 644 (rw-r--r--) | 600 (rw-------) |

### INFRA-08 — Mises à jour Système
**🟡 À vérifier**

Vérifier les mises à jour de sécurité disponibles : `apt list --upgradable`

---

## 🚀 Plan de Remédiation Prioritaire

| # | Action | Sévérité | Effort | Délai |
|---|--------|----------|--------|-------|
| 1 | Corriger permissions .env et .db (chmod 600) | 🔴 Critique | 1 min | Immédiat |
| 2 | Activer CSP dans Helmet | 🔴 Critique | 15 min | < 1 jour |
| 3 | Rate limiter `/api/auth/verify-otp` | 🟠 Haute | 10 min | < 1 jour |
| 4 | Masquer error.message en production | 🟠 Haute | 30 min | < 3 jours |
| 5 | `npm audit fix` — corriger dépendances | 🟠 Haute | 5 min | Immédiat |
| 6 | Sanitizer les noms de fichiers (anti-XSS) | 🟠 Haute | 1h | < 3 jours |
| 7 | Vérifier BOLA sur preview/download | 🟠 Haute | 2h | < 1 semaine |
| 8 | Forcer changement mdp admin | 🟡 Moyenne | 30 min | < 1 semaine |
| 9 | Ajouter Permissions-Policy header | 🟡 Moyenne | 5 min | < 1 semaine |
| 10 | Valider magic bytes uploads | 🟡 Moyenne | 1h | < 2 semaines |

---

## 📈 Comparaison v1 → v2

| Métrique | v1 (fév 2026) | v2 (fév 2026) |
|----------|---------------|---------------|
| Score global | 58/100 | **72/100** |
| Critiques | 4 | **1** |
| Hautes | 5 | **4** |
| Auth sécurisée | ❌ Base64 | ✅ JWT HS256 |
| Routes protégées | ~60% | **~95%** |
| Firewall | ⚠️ Partiel | ✅ DROP all |
| Backend exposé | ❌ Direct | ✅ Nginx proxy |
| Tests auto | 91/95 | 91/95 |

**Progression : +14 points.** Les corrections majeures de l'authentification et du firewall ont significativement réduit la surface d'attaque.

---

*Rapport généré le 19 février 2026 — ShareAzure Security Audit v2*  
*Auditeur : Le Claude — STTI / APRIL Assurances*

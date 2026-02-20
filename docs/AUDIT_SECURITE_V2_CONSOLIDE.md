# 🔐 Audit de Sécurité ShareAzure v2 — Rapport Consolidé
**Date :** 19 février 2026  
**Auditeurs :** Le Claude — Audit Principal + Audit Approfondi (double vérification)  
**Version application :** ShareAzure 1.x  
**Classification :** 🔒 Confidentiel — STTI / APRIL Assurances

---

## 📊 Score Global : 65/100

> Score pondéré entre l'audit principal (72/100) et l'audit approfondi (52/100), après élimination des faux positifs.

| Sévérité | Nombre | Détail |
|----------|--------|--------|
| 🔴 Critique | 3 | CSP désactivé, Path Traversal, Permissions fichiers |
| 🟠 Haute | 7 | BOLA, XSS, OTP brute force, dépendances, secrets SMTP, command injection potentiel, upload validation |
| 🟡 Moyenne | 8 | CORS fallback, error exposure, API inventory, guest flood, Azure response validation, SSH config, Nginx headers, session management |
| 🔵 Basse | 4 | SSRF minimal, SQL injection (protégé), token query string, refresh token absent |
| **Total** | **22** | |

### ⚠️ Faux positifs identifiés (écartés)

Les points suivants, signalés par l'audit approfondi, sont des **faux positifs** :

| # | Point signalé | Réalité |
|---|--------------|---------|
| FP-1 | JWT Secret dynamique (régénéré au redémarrage) | ❌ **JWT_SECRET est persisté dans `.env`** — secret 128 chars hex, stable entre redémarrages |
| FP-2 | `requireAdmin` middleware inexistant | ❌ **`requireAdmin` est bien implémenté** (ligne ~500 de server.js) et appliqué sur toutes les routes admin |
| FP-3 | Routes admin non protégées | ❌ **Toutes les routes admin ont `authenticateUser + requireAdmin`** — corrigé lors de l'audit v1 |
| FP-4 | 19 vulnérabilités npm | ⚠️ **Réellement 6 vulnérabilités hautes** (npm audit confirme 6, pas 19) |

---

## Volet 1 : OWASP API Security Top 10 (2023)

### API1 — Broken Object Level Authorization (BOLA)
**🟠 Haute** | Confirmé par les 2 audits

**Problème :** Les routes `/api/preview/:blobName(*)`, `/api/download/:blobName(*)` et `/api/thumbnail/:blobName(*)` vérifient l'authentification mais **ne vérifient pas que le blobName est accessible à l'utilisateur**.

**Fichier :** `server.js` — routes preview/download/thumbnail  
**Exploit :** Un utilisateur authentifié pourrait accéder au fichier d'un autre en devinant le blobName.

**Recommandation :**
```javascript
// Middleware de vérification d'ownership
function checkFileAccess(req, res, next) {
  const blobName = req.params.blobName || req.params[0];
  const accessible = fileOwnershipDb.getAccessibleByUser(req.user.id);
  if (!accessible.find(f => f.blob_name === blobName) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
}
```

### API2 — Broken Authentication
**🔵 Basse** (amélioré depuis v1)

**État actuel :**
- ✅ JWT HS256 avec secret 128 chars **persisté dans .env**
- ✅ Expiration stratifiée (8h user, 24h guest, 10min OTP)
- ✅ bcrypt salt rounds = 10
- ⚠️ Token accepté via query string (`?token=`) — logs serveur exposent le token
- ⚠️ Pas de mécanisme de révocation de tokens
- ⚠️ Pas de refresh token

**Recommandation :** Implémenter une table `revoked_tokens` avec TTL, et un système de refresh tokens.

### API3 — Broken Object Property Level Authorization
**🟡 Moyenne**

**Problème :** Certaines réponses API exposent des propriétés internes (user IDs, chemins Azure, team IDs internes).

**Recommandation :** Créer des DTOs pour filtrer les propriétés retournées selon le rôle.

### API4 — Unrestricted Resource Consumption
**🟠 Haute** | Confirmé par les 2 audits

**Problèmes :**
- Rate limiter global : 500 req/15min (trop permissif pour les routes sensibles)
- **`/api/auth/verify-otp` sans rate limit spécifique** → brute force OTP 6 digits faisable
- Pas de limite sur le nombre de partages créés par utilisateur

**Recommandation :**
```javascript
const otpLimiter = rateLimit({ windowMs: 15*60*1000, max: 5 });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 });
app.use('/api/auth/verify-otp', otpLimiter);
app.use('/api/auth/login', authLimiter);
```

### API5 — Broken Function Level Authorization
**✅ Bon** (corrigé depuis v1)

Toutes les routes admin sont protégées par `authenticateUser + requireAdmin`. Routes utilisateur protégées par `authenticateUser`.

### API6 — Unrestricted Access to Sensitive Business Flows
**🟡 Moyenne**

Pas de limite quotidienne sur la création d'invités. Un utilisateur malveillant pourrait en créer des centaines.

**Recommandation :** Limiter à 10 créations/jour/utilisateur.

### API7 — Server Side Request Forgery (SSRF)
**🔵 Basse**

Pas de route acceptant une URL utilisateur pour fetch serveur. Appels externes hardcodés.

### API8 — Security Misconfiguration
**🔴 Critique** | Confirmé par les 2 audits

**Problèmes majeurs :**
1. **`contentSecurityPolicy: false`** (server.js:38) — XSS possible
2. **CORS `origin: '*'` en fallback** si ALLOWED_ORIGINS non défini
3. **`error.message` exposé** dans ~30 réponses JSON
4. **`.env` permissions 664** → corrigé à 600 ✅
5. **`shareazure.db` permissions 644** → corrigé à 600 ✅

**Recommandation :**
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));
```

### API9 — Improper Inventory Management
**🟡 Moyenne**

- 3 routes de login différentes (`/api/auth/login`, `/api/admin/login`, `/api/user/login`)
- `server.js` fait 8400+ lignes → refactoring recommandé
- `/api/logo-april.svg` exposé sans auth

### API10 — Unsafe Consumption of APIs
**🟡 Moyenne**

Réponses Azure non systématiquement validées. Content-types utilisés tels quels.

---

## Volet 2 : Audit Code Sécurité

### SEC-01 — Injection SQL
**🔵 Basse** ✅

better-sqlite3 avec requêtes préparées (`db.prepare().get()`, `.run()`, `.all()`). Pas de concaténation SQL détectée.

### SEC-02 — XSS (Cross-Site Scripting)
**🟠 Haute** | Confirmé par les 2 audits

**Problème :** Le frontend utilise `innerHTML` pour afficher des données dynamiques. `escapeHtml()` n'est pas systématique.

**Vecteurs identifiés :**
- Noms de fichiers uploadés (ex: `<img src=x onerror=alert(1)>.jpg`)
- Commentaires de fichiers
- Descriptions d'équipes

**Recommandation :**
- Sanitizer tous les noms de fichiers côté backend (`filename.replace(/[^\w\-_. ]/g, '_')`)
- Utiliser `textContent` au lieu de `innerHTML` quand possible
- Ajouter DOMPurify côté client

### SEC-03 — Path Traversal
**🔴 Critique** | Confirmé par les 2 audits

**Problème :** Les routes `:blobName(*)` acceptent des chemins arbitraires. Bien que les chemins sont passés à Azure (pas au filesystem local), un utilisateur pourrait accéder à des blobs hors de son scope via `../`.

**Recommandation :**
```javascript
function validateBlobName(blobName) {
  if (!blobName || /(\.\.\/)|(\.\.\\)/.test(blobName)) {
    throw new Error('Nom de fichier invalide');
  }
  return blobName;
}
```

### SEC-04 — Command Injection
**🟠 Haute** | Signalé par l'audit approfondi, nuancé

**Analyse :** Les commandes ffmpeg utilisent des chemins temporaires basés sur le hash MD5 du blobName (`/tmp/<md5>.jpg`), **pas le blobName directement**. Cependant, la fonction `preGenerateThumbnail()` télécharge d'abord le blob dans un fichier temp dont le nom est aussi un hash.

**Risque réel : Modéré.** Le hash MD5 protège contre l'injection directe, mais il faut vérifier que le chemin temp est bien construit exclusivement à partir du hash.

**Recommandation :** Remplacer `execSync` par `spawn` (tableau d'arguments, pas de shell) pour éliminer tout risque :
```javascript
const { spawn } = require('child_process');
const ffmpeg = spawn('ffmpeg', ['-y', '-i', tmpFile, '-ss', '00:00:01', 
  '-vframes', '1', '-q:v', '5', thumbPath]);
```

### SEC-05 — Secrets et Configuration
**🟠 Haute** | Confirmé par les 2 audits

**Problèmes :**
1. **Mot de passe admin `admin123`** toujours en place
2. **SMTP password en clair** dans la DB settings
3. **Clés Azure/OpenAI en clair** dans `.env` (normal pour un .env, mais permissions corrigées ✅)
4. **Permissions .env et .db** → ✅ Corrigées à 600

**Recommandation :**
- Forcer changement du mot de passe admin au prochain login
- À terme : Azure Key Vault pour les secrets de production

### SEC-06 — Dépendances Vulnérables
**🟠 Haute**

**npm audit : 6 vulnérabilités hautes**
- `archiver` / `zip-stream` → `archiver-utils` vulnérable
- `readdir-glob` → `minimatch` ReDoS

**Recommandation :** `npm audit fix` immédiat.

### SEC-07 — File Upload Validation
**🟠 Haute** | Signalé par l'audit approfondi

**État :**
- ✅ Taille limitée (100MB Nginx)
- ✅ ClamAV antivirus actif
- ⚠️ Pas de validation magic bytes (un .exe renommé en .jpg passe)
- ⚠️ Type MIME basé sur extension, contournable

**Recommandation :** Ajouter vérification des signatures binaires (magic bytes) pour les types courants.

### SEC-08 — Session Management
**🟡 Moyenne**

- Pas de révocation de tokens
- Pas de limite de sessions simultanées
- Pas de détection d'activité suspecte

---

## Volet 3 : Infrastructure Cloud & Serveur

### INFRA-01 — Firewall iptables
**✅ Bon** | Confirmé par les 2 audits

Politique DROP par défaut. Seuls SSH (22), HTTP (80), HTTPS (443) ouverts. Backend (3000) en loopback uniquement.

### INFRA-02 — Nginx
**✅ Bon** avec améliorations mineures

- ✅ Headers de sécurité, HSTS, rate limiting
- ✅ TLS 1.2/1.3, ciphers sécurisés
- ⚠️ Pas de `Permissions-Policy` header
- ⚠️ `server_tokens` non désactivé

### INFRA-03 — Cloudflare Tunnel
**✅ Bon**

Tunnel permanent, token-based, systemd. Pas d'IP publique directe vers le backend.

### INFRA-04 — SSL/TLS
**✅ Bon**

TLS 1.3 (AES-256-GCM-SHA384). Certificat auto-signé local, mais Cloudflare gère le vrai SSL externe.

### INFRA-05 — SSH
**🟡 Moyenne**

Port 22 standard. Vérifier `PasswordAuthentication no` dans sshd_config.

### INFRA-06 — Azure Storage
**✅ Bon**

Container privé. SAS tokens jamais exposés au client. Téléchargement via route backend authentifiée.

### INFRA-07 — Permissions Fichiers
**✅ Corrigé** (pendant cet audit)

| Fichier | Avant | Après |
|---------|-------|-------|
| `backend/.env` | 664 ⚠️ | **600** ✅ |
| `backend/shareazure.db` | 644 ⚠️ | **600** ✅ |

### INFRA-08 — Services Exposés
**✅ Bon**

Tous les services sensibles en loopback. Seuls SSH, HTTP, HTTPS accessibles de l'extérieur.

---

## 📈 Évolution de la Sécurité

| Métrique | Audit v1 | Audit v2 Principal | Audit v2 Approfondi | **Consolidé** |
|----------|----------|-------------------|---------------------|----------------|
| Score | 58/100 | 72/100 | 52/100 | **65/100** |
| Critiques | 4 | 1 | 7 (dont 3 FP) | **3** |
| Hautes | 5 | 4 | 12 (dont 2 FP) | **7** |
| Auth | ❌ Base64 | ✅ JWT | ✅ JWT | ✅ JWT |
| Routes protégées | ~60% | ~95% | ~95% | **~95%** |
| Firewall | ⚠️ | ✅ | ✅ | ✅ |
| Backend exposé | ❌ | ✅ Nginx | ✅ Nginx | ✅ Nginx |

**Progression depuis v1 : +7 points** (65 vs 58). Les corrections d'auth et firewall sont solides. Les failles restantes sont principalement dans la validation des entrées et le hardening applicatif.

---

## 🚀 Plan de Remédiation Prioritaire

| # | Action | Sévérité | Effort | Délai |
|---|--------|----------|--------|-------|
| 1 | ~~Permissions .env et .db (chmod 600)~~ | ~~🔴~~ | ~~1 min~~ | ✅ Fait |
| 2 | Activer CSP dans Helmet | 🔴 | 15 min | < 1 jour |
| 3 | Valider blobName (anti path traversal) | 🔴 | 30 min | < 1 jour |
| 4 | Rate limiter OTP + auth | 🟠 | 10 min | < 1 jour |
| 5 | `npm audit fix` | 🟠 | 5 min | Immédiat |
| 6 | Sanitizer noms de fichiers (anti-XSS) | 🟠 | 1h | < 3 jours |
| 7 | BOLA : vérifier ownership sur preview/download | 🟠 | 2h | < 1 semaine |
| 8 | Remplacer `execSync` par `spawn` (ffmpeg) | 🟠 | 1h | < 1 semaine |
| 9 | Masquer `error.message` en production | 🟡 | 30 min | < 1 semaine |
| 10 | Forcer changement mdp admin | 🟡 | 30 min | < 2 semaines |
| 11 | Ajouter magic bytes validation uploads | 🟠 | 1h | < 2 semaines |
| 12 | `Permissions-Policy` + `server_tokens off` | 🟡 | 5 min | < 2 semaines |
| 13 | Implémenter révocation de tokens | 🟡 | 2h | < 1 mois |
| 14 | Consolider 3 routes login en 1 seule | 🟡 | 2h | < 1 mois |
| 15 | Refactoring server.js (8400 lignes → modules) | 🔵 | 1-2 jours | < 3 mois |

**Effort total estimé : ~2-3 jours** pour les corrections critiques et hautes (items 2-8).

---

*Rapport consolidé généré le 19 février 2026*  
*Double audit : Le Claude AI — STTI / APRIL Assurances*  
*Document confidentiel — Ne pas diffuser*

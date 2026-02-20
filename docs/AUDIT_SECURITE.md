# 🔒 Audit de Sécurité — ShareAzure

> **Date** : 18 février 2026
> **Auditeur** : Le Claude
> **Périmètre** : Backend (server.js, 8301 lignes), Nginx, Auth, API, Infrastructure
> **Sévérité** : 🔴 Critique | 🟠 Haute | 🟡 Moyenne | 🟢 Basse | ✅ Conforme

---

## Résumé exécutif

| Sévérité | Nombre | Statut |
|----------|--------|--------|
| 🔴 Critique | 4 | À corriger immédiatement |
| 🟠 Haute | 5 | À corriger rapidement |
| 🟡 Moyenne | 6 | À planifier |
| 🟢 Basse | 4 | Améliorations recommandées |
| ✅ Conforme | 12 | Points validés |

**Score global : 58/100** — Des bases solides mais des vulnérabilités critiques à corriger.

---

## 🔴 VULNÉRABILITÉS CRITIQUES

### CRIT-01 : Token d'authentification prévisible (pas de JWT)

**Fichier** : `server.js:3706, 3799`
**Description** : Les tokens d'authentification sont de simples Base64 de `user:<id>:<username>:<timestamp>`. N'importe qui peut forger un token valide sans connaître de secret.

```javascript
// ACTUEL (vulnérable)
const token = Buffer.from(`user:${user.id}:${user.username}:${Date.now()}`).toString('base64');

// Un attaquant peut forger :
Buffer.from('user:1:admin:1234567890').toString('base64')
// → "dXNlcjoxOmFkbWluOjEyMzQ1Njc4OTA=" → Accès admin complet
```

**Impact** : **Usurpation d'identité totale**. Tout attaquant connaissant un username + id peut accéder au compte sans mot de passe.
**Correction** :
```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Générer
const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

// Vérifier
const decoded = jwt.verify(token, JWT_SECRET);
```

---

### CRIT-02 : ~20 routes admin/user sans authentification middleware

**Description** : De nombreuses routes sensibles n'utilisent pas le middleware `authenticateUser` et font leur propre vérification inline (ou aucune).

**Routes NON PROTÉGÉES (aucun auth) :**
| Route | Risque |
|-------|--------|
| `GET /api/settings` | Fuite config complète |
| `GET /api/settings/:key` | Lecture de n'importe quel paramètre |
| `PUT /api/settings` | **Modification de TOUTE la config** |
| `POST /api/settings/reset` | **Reset usine** |
| `POST /api/container/init` | Init container Azure |
| `GET /api/download/:blobName` | **Téléchargement de TOUT fichier sans auth** |
| `GET /api/preview/:blobName(*)` | **Preview de TOUT fichier sans auth** |
| `GET /api/admin/logs` | Lecture des logs d'activité |
| `DELETE /api/admin/logs` | Purge des logs |
| `GET/POST/DELETE /api/admin/email-domains/*` | Gestion domaines email |
| `POST /api/share/generate` | Création de liens de partage |
| `POST /api/share/send-email` | Envoi d'emails via SMTP |

**Impact** : Un attaquant non authentifié peut télécharger n'importe quel fichier Azure, modifier la config, purger les logs, envoyer des emails.

**Correction** : Ajouter `authenticateUser, requireAdmin` sur TOUTES les routes admin, et `authenticateUser` sur les routes user :
```javascript
// AVANT
app.get('/api/settings', async (req, res) => { ... });
// APRÈS
app.get('/api/settings', authenticateUser, requireAdmin, async (req, res) => { ... });
```

---

### CRIT-03 : Route download sans contrôle d'accès

**Fichier** : `server.js:1042`
**Description** : `GET /api/download/:blobName` permet de télécharger **n'importe quel blob** Azure par son nom, sans aucune authentification. Le token est optionnel et non vérifié.

```javascript
// L'attaquant peut directement :
// GET /api/download/team1/confidentiel.pdf → Fichier téléchargé
```

**Impact** : **Fuite de données massive**. Toute personne connaissant (ou devinant) un nom de blob peut télécharger les fichiers.
**Correction** : Exiger l'authentification et vérifier que l'utilisateur a accès au fichier.

---

### CRIT-04 : Mot de passe admin par défaut `admin123`

**Fichier** : `server.js:3249`, `migrateUsers.js:16`
**Description** : Le compte admin est créé avec le mot de passe `admin123`, hashé en bcrypt. Ce mot de passe est hardcodé et documenté dans le code source.

**Impact** : Premier vecteur d'attaque. Tout attaquant essaiera admin/admin123.
**Correction** :
1. Forcer le changement de mot de passe au premier login
2. Ou générer un mot de passe aléatoire à l'installation et l'afficher une seule fois
3. **Action immédiate** : changer le mot de passe admin en production

---

## 🟠 VULNÉRABILITÉS HAUTES

### HIGH-01 : CORS configuré sur `localhost` uniquement

**Fichier** : `backend/.env`
```
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000
```

**Description** : Les origines autorisées sont `localhost` seulement. Comme l'app est derrière Cloudflare tunnel sur `shareazure.deberti.fr`, les requêtes cross-origin depuis le vrai domaine ne matchent pas → le CORS fallback `|| '*'` dans le code s'active, ce qui **autorise TOUTES les origines**.

```javascript
origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
// ALLOWED_ORIGINS existe → ['http://localhost:8080','http://localhost:3000']
// Mais les requêtes viennent de https://shareazure.deberti.fr → CORS bloque
// Sauf que le frontend est servi par le même serveur → pas de CORS en pratique
```

**Correction** :
```
ALLOWED_ORIGINS=https://shareazure.deberti.fr,http://localhost:3000
```

---

### HIGH-02 : Pas d'expiration de token

**Fichier** : `server.js:350-400`
**Description** : Le middleware `authenticateUser` ne vérifie PAS le timestamp dans le token. Un token reste valide indéfiniment.

**Impact** : Un token volé (log, réseau, XSS) donne un accès permanent.
**Correction** : Avec JWT (voir CRIT-01), ajouter `expiresIn: '8h'` et vérifier l'expiration.

---

### HIGH-03 : Pas de brute-force protection sur les logins

**Description** : Le rate limiter global est à 500 req/15min sur `/api/`. Les routes `/api/admin/login`, `/api/user/login`, `/api/guest/login` n'ont pas de rate limiting dédié dans Express.

Le Nginx a `5r/m` sur `/api/auth/` mais les routes de login sont sur `/api/admin/login` et `/api/user/login` (hors du préfixe `/api/auth/`).

**Impact** : Attaque bruteforce possible sur les endpoints login.
**Correction** :
1. Déplacer les routes login sous `/api/auth/` (login, admin-login, guest-login)
2. Ou ajouter des `location` Nginx pour `/api/admin/login` et `/api/user/login`
3. Implémenter un verrouillage temporaire après 5 échecs consécutifs

---

### HIGH-04 : Token invité sans expiration vérifiée côté token

**Fichier** : `server.js:420-470`
**Description** : Le token invité est `guest:<guestId>`. Le middleware vérifie l'expiration du compte en DB, mais le token lui-même n'expire jamais. Si le compte est réactivé après expiration, le vieux token refonctionne.

---

### HIGH-05 : Routes `/api/user/files`, `/api/user/folders`, `/api/user/files/rename`, `/api/user/files/move` avec auth inline faible

**Fichier** : `server.js:4318+`
**Description** : Ces routes font leur propre vérification de token inline au lieu d'utiliser le middleware. La vérification décode le Base64 mais ne vérifie que `parts[0] === 'user'` — pas de validation de l'utilisateur en DB dans certains cas.

**Impact** : Couplé à CRIT-01, n'importe qui peut accéder/modifier les fichiers de n'importe qui.

---

## 🟡 VULNÉRABILITÉS MOYENNES

### MED-01 : `contentSecurityPolicy: false` dans Helmet

**Fichier** : `server.js:28`
```javascript
app.use(helmet({ contentSecurityPolicy: false }));
```
**Impact** : Pas de protection contre le XSS via injection de scripts. Un fichier HTML uploadé et previewé pourrait exécuter du JS.
**Correction** : Configurer un CSP strict :
```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
  }
}
```

---

### MED-02 : Preview de fichiers HTML = XSS potentiel

**Fichier** : `server.js:1093`
**Description** : La route preview sert les fichiers avec leur Content-Type original. Un fichier `.html` uploadé sera rendu comme HTML avec scripts actifs.

**Impact** : Stored XSS — un attaquant uploade un HTML malveillant, le partage, et vole les tokens des victimes.
**Correction** : Forcer `Content-Type: text/plain` pour les fichiers HTML, ou les sandboxer dans un iframe `sandbox`.

---

### MED-03 : Pas de validation/sanitisation des noms de fichiers

**Description** : Les noms de blob sont utilisés tels quels dans les headers HTTP (`Content-Disposition`). Un nom de fichier malveillant pourrait injecter des headers.

```javascript
res.setHeader('Content-Disposition', `attachment; filename="${properties.metadata?.originalName || blobName}"`);
```

**Correction** : Sanitiser le nom avec `encodeURIComponent` ou une librairie dédiée :
```javascript
const safeName = encodeURIComponent(originalName).replace(/%20/g, ' ');
res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
```

---

### MED-04 : Logs `activity_logs` purgeable sans auth

**Route** : `DELETE /api/admin/logs` (non protégée)
**Impact** : Un attaquant peut effacer les traces de son intrusion.

---

### MED-05 : Pas de HTTPS enforced dans Express

**Description** : Express accepte HTTP et HTTPS. Même si Nginx fait le SSL termination, si un jour le port 3000 est exposé, tout transite en clair.
**Correction** : Ajouter un middleware de redirection HTTP→HTTPS quand pas en localhost.

---

### MED-06 : `crossOriginResourcePolicy: "cross-origin"`

**Impact** : Permet le chargement de ressources (images, fichiers) depuis n'importe quelle origine. Peut faciliter l'exfiltration de données via des pages tierces.

---

## 🟢 AMÉLIORATIONS RECOMMANDÉES

### LOW-01 : Pas de logging des tentatives de login échouées avec IP

**Description** : Les échecs de login sont loggés mais sans l'adresse IP. Utile pour détecter les attaques.

### LOW-02 : Rate limiter global à 500 req/15min = généreux

**Description** : 500 requêtes par fenêtre de 15 minutes est assez haut. Pour un usage normal, 200 suffirait.

### LOW-03 : Pas de cookie HttpOnly/Secure pour le token

**Description** : Le token est stocké en `localStorage` côté client (visible en JS). Un cookie `HttpOnly; Secure; SameSite=Strict` serait plus résistant au XSS.

### LOW-04 : Pas de `Permissions-Policy` header

**Description** : Manque le header `Permissions-Policy` pour restreindre les APIs navigateur (caméra, micro, géolocation).

---

## ✅ POINTS CONFORMES

| # | Point | Statut |
|---|-------|--------|
| 1 | Mots de passe hashés bcrypt | ✅ |
| 2 | Nginx reverse proxy (backend non exposé) | ✅ |
| 3 | Firewall iptables (SSH only) | ✅ |
| 4 | Cloudflare tunnel (pas d'IP exposée) | ✅ |
| 5 | Pas d'injection SQL (paramètres bindés) | ✅ |
| 6 | ClamAV antivirus sur upload | ✅ |
| 7 | TLS 1.2/1.3 dans Nginx | ✅ |
| 8 | Headers sécurité Nginx (X-Frame, HSTS, nosniff) | ✅ |
| 9 | Fichiers .env/.db bloqués par Nginx | ✅ |
| 10 | `.env` dans `.gitignore` (non commité) | ✅ |
| 11 | Rate limiting Nginx sur auth et share | ✅ |
| 12 | Partage avec mot de passe obligatoire | ✅ |

---

## 📋 Plan de remédiation (priorité)

### Immédiat (avant mise en production)

| # | Action | Effort |
|---|--------|--------|
| 1 | **Migrer vers JWT** — remplacer tokens Base64 par `jsonwebtoken` signé | 2h |
| 2 | **Protéger TOUTES les routes** — ajouter `authenticateUser` + `requireAdmin` sur les ~20 routes ouvertes | 1h |
| 3 | **Sécuriser /download et /preview** — exiger auth + vérifier ownership du fichier | 1h |
| 4 | **Changer mot de passe admin** en production | 5min |
| 5 | **Corriger CORS** — ajouter `https://shareazure.deberti.fr` aux origines | 5min |

### Court terme (1-2 semaines)

| # | Action | Effort |
|---|--------|--------|
| 6 | Rate limiting dédié sur les endpoints login | 30min |
| 7 | Verrouillage compte après 5 échecs | 1h |
| 8 | CSP (Content Security Policy) activé | 1h |
| 9 | Sanitiser Content-Disposition headers | 30min |
| 10 | Forcer text/plain pour preview HTML | 30min |

### Moyen terme

| # | Action | Effort |
|---|--------|--------|
| 11 | Migration tokens → cookies HttpOnly | 3h |
| 12 | Permissions-Policy header | 15min |
| 13 | Logging IP sur échecs login | 30min |
| 14 | Force password change on first login | 1h |
| 15 | Audit trail immuable (logs non purgeables) | 2h |

---

## Matrice des risques

```
Impact ↑
         │
  ÉLEVÉ  │  CRIT-01   CRIT-02   CRIT-03
         │  (Token)   (Routes)  (Download)
         │
  MOYEN  │  HIGH-03   MED-01    MED-02
         │  (Brute)   (CSP)     (XSS)
         │
  FAIBLE │  LOW-01    LOW-02    LOW-04
         │  (Logs IP) (Rate)    (Policy)
         │
         └────────────────────────────→
           FACILE    MOYEN     DIFFICILE
                                Correction →
```

---

## Conclusion

Les **fondations sont bonnes** : bcrypt, firewall, Nginx, Cloudflare tunnel, ClamAV, SQL paramétré. Cependant, le système d'authentification par token Base64 est une **faille structurelle majeure** qui rend toutes les protections inutiles — un attaquant peut forger un token admin en 10 secondes.

**Priorité #1 absolue** : migrer vers JWT et protéger les routes ouvertes. Le reste peut suivre progressivement.

Tu veux que je corrige les vulnérabilités critiques maintenant ?

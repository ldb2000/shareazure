# Audit de Sécurité ShareAzure — V3
**Date :** 21 février 2026  
**Auditeur :** Le Claude (IA)  
**Version :** 3.0  
**Score précédent :** 65/100 (V2, 20/02/2026)  
**Score actuel : 78/100**

---

## Résumé exécutif

Progrès significatifs depuis la V2 : 0 vulnérabilités npm, fail2ban applicatif ajouté, 2FA par email, ports publics fermés, firewall renforcé. Les principales faiblesses restantes sont l'injection de commandes via execSync/ffmpeg, l'absence de validation anti-path-traversal sur blobName, et le mot de passe admin par défaut.

---

## Améliorations depuis V2 (65→78)

| Correction | Impact |
|-----------|--------|
| ✅ 0 vulnérabilités npm (minimatch ReDoS corrigé via overrides) | +3 |
| ✅ Fail2ban applicatif (auto-ban, géoloc, whitelist, admin UI) | +3 |
| ✅ 2FA par email (OTP 6 chiffres, 5min expiry) | +2 |
| ✅ Ports 80/8443 fermés au public (localhost only) | +2 |
| ✅ Port 22 fermé (SSH via Tailscale uniquement) | +2 |
| ✅ iptables-restore au boot (service systemd) | +1 |

---

## Vulnérabilités restantes

### 🔴 Critiques (3)

| ID | Vulnérabilité | Description | Recommandation |
|----|--------------|-------------|----------------|
| SEC-01 | **Injection de commandes (execSync + ffmpeg)** | `execSync(\`ffmpeg -i "${tmpFile}"...\`)` dans thumbnail/preview (~10 occurrences). Si `tmpFile` contenait des caractères spéciaux, injection possible. Le risque est atténué car tmpFile est généré par `os.tmpdir() + uuid`, pas par l'utilisateur. | Remplacer `execSync` par `spawn` avec tableau d'arguments (pas de shell). |
| SEC-02 | **Mot de passe admin par défaut** | `admin123` hashé en dur dans le code de migration (ligne 3634). Tout le monde qui lit le code GitHub connaît ce mot de passe. | Changer immédiatement via l'UI (déjà disponible). Forcer le changement au premier login. |
| SEC-03 | **Route /api/user/login sans fail2ban** | Doublon de `/api/auth/login` mais sans le middleware `fail2banMiddleware`. Un attaquant peut brute-forcer via cette route. | Ajouter `fail2banMiddleware` sur `/api/user/login`. |

### 🟠 Hautes (4)

| ID | Vulnérabilité | Description | Recommandation |
|----|--------------|-------------|----------------|
| SEC-04 | **Pas de validation blobName anti-traversal** | Les routes `/:blobName(*)` acceptent n'importe quel chemin. Bien que Azure Blob Storage ignore `../`, un middleware de validation serait une défense en profondeur. | Ajouter un middleware qui rejette les blobName contenant `..` ou commençant par `/`. |
| SEC-05 | **CSP désactivé** | `contentSecurityPolicy: false` dans Helmet. Pas de protection XSS via Content-Security-Policy. | Activer CSP avec politique restrictive (self + CDN utilisés). |
| SEC-06 | **Information disclosure dans les erreurs** | ~40 routes renvoient `error.message` brut au client (`res.status(500).json({ error: error.message })`). Peut révéler des chemins, requêtes SQL, infos système. | Renvoyer un message générique en prod, logger le détail côté serveur. |
| SEC-07 | **Backup .env lisible** | `backend/.env.bak.20260220` contient les clés Azure en clair (chmod 600, gitignored). Le fichier racine `.env` (BACKEND_URL seulement) est en 644. | Supprimer le `.env.bak` ou le déplacer hors du projet. Passer `.env` racine en 600. |

### 🟡 Moyennes (4)

| ID | Vulnérabilité | Description | Recommandation |
|----|--------------|-------------|----------------|
| SEC-08 | **CORS wildcard fallback** | Si `ALLOWED_ORIGINS` n'est pas défini, CORS accepte `*`. En prod c'est configuré, mais le fallback est dangereux. | Remplacer le fallback `'*'` par une erreur ou une liste vide. |
| SEC-09 | **Routes publiques non essentielles** | `/api/settings/auth`, `/api/company-info`, `/api/company-logo`, `/api/teams/:teamId/logo` sont accessibles sans auth. Faible risque mais fuite d'info (nom entreprise, config auth). | Évaluer si ces routes doivent vraiment être publiques. |
| SEC-10 | **Pas de cookie httpOnly pour le token** | Le JWT est stocké dans `localStorage` côté client. Vulnérable au XSS (lecture du token via JS malveillant). | Migrer vers un cookie httpOnly + sameSite=strict. |
| SEC-11 | **Bcrypt rounds = 10** | Standard actuel, mais 12 est recommandé par OWASP depuis 2024. | Passer à 12 rounds pour les nouveaux hash. |

### 🟢 Basses (2)

| ID | Vulnérabilité | Description | Recommandation |
|----|--------------|-------------|----------------|
| SEC-12 | **Rate limiting global seulement** | 500 req/15min par IP sur `/api/*`. Pas de rate limit spécifique sur OTP verify (brute force 6 chiffres). Nginx limite `/api/auth/` à 5r/m. | Ajouter rate limit sur `/api/auth/verify-otp` (max 5 tentatives/10min). |
| SEC-13 | **Nettoyage OTP codes** | Le cleanup des OTP codes se fait dans la route login (seulement quand un OTP est généré). Les codes expirés mais non nettoyés restent en base. | Ajouter un cleanup périodique (dans le setInterval existant). |

---

## Matrice de sécurité

| Domaine | Score | Détail |
|---------|-------|--------|
| Authentification | 8/10 | JWT HS256, bcrypt, 2FA email, fail2ban ✅. -1 route sans fail2ban, -1 admin123 |
| Autorisation | 9/10 | RBAC 4 rôles, authenticateUser + requireAdmin partout, scoped access ✅ |
| Injection SQL | 10/10 | 100% paramètres bindés (prepare/run), aucune concaténation SQL ✅ |
| Injection commandes | 4/10 | execSync avec interpolation sur ~10 lignes (ffmpeg/pdftoppm) |
| XSS | 6/10 | Helmet actif mais CSP désactivé, pas de sanitization explicite |
| Configuration | 8/10 | CORS configuré, HTTPS only, secrets en systemd, .db chmod 600 ✅ |
| Infrastructure | 10/10 | 0 port public, Tailscale SSH, Cloudflare tunnel, fail2ban, blocklists ✅ |
| Chiffrement | 8/10 | HTTPS via Cloudflare, JWT signé, bcrypt. localStorage vulnérable XSS |
| Logging/Audit | 9/10 | activity_logs, fail2ban, login_attempts, géoloc IP ✅ |
| Dépendances | 10/10 | 0 vulnérabilité npm ✅ |

**Score global : 78/100**

---

## Plan d'action prioritaire

### Immédiat (cette semaine)
1. ⚠️ **Changer le mot de passe admin** (SEC-02) — via le menu utilisateur
2. 🔧 **Ajouter `fail2banMiddleware` sur `/api/user/login`** (SEC-03) — 1 ligne
3. 🔧 **Ajouter validation blobName** (SEC-04) — middleware ~5 lignes

### Court terme (2 semaines)
4. 🔧 **Remplacer execSync par spawn** (SEC-01) — refactor ffmpeg/pdftoppm
5. 🔧 **Activer CSP** (SEC-05) — config Helmet
6. 🔧 **Messages d'erreur génériques** (SEC-06) — wrapper catch

### Moyen terme (1 mois)
7. 🔧 **Cookie httpOnly pour JWT** (SEC-10) — refactor auth
8. 🔧 **Rate limit OTP** (SEC-12) — express-rate-limit
9. 🧹 **Supprimer .env.bak** (SEC-07) — rm
10. 🧹 **Nettoyer les routes publiques** (SEC-09) — évaluer

---

## Historique des scores

| Version | Date | Score | Vulnérabilités |
|---------|------|-------|----------------|
| V1 | 19/02/2026 | 58/100 | 4 critiques, 5 hautes, 6 moyennes, 4 basses |
| V2 | 20/02/2026 | 65/100 | 3 critiques, 7 hautes, 8 moyennes, 4 basses |
| **V3** | **21/02/2026** | **78/100** | **3 critiques, 4 hautes, 4 moyennes, 2 basses** |

Progression : +20 points en 3 jours. Infrastructure maintenant solide (10/10).

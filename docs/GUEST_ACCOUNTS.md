# Système de Comptes Invités Temporaires

## Vue d'ensemble

Le système de comptes invités permet aux utilisateurs APRIL de créer des accès temporaires pour des partenaires externes. Ces comptes invités ont des permissions limitées et expirent automatiquement après une durée configurable.

## Caractéristiques

### Permissions des rôles

| Rôle | Créer invités | Upload | Partage | Suppression | Voir fichiers |
|------|--------------|--------|---------|-------------|---------------|
| **admin** | ✅ | ✅ | ✅ | ✅ Tous | ✅ Tous |
| **april_user** | ✅ | ✅ | ✅ | ✅ Ses fichiers + ses invités | ✅ Ses fichiers + ses invités |
| **user** | ❌ | ✅ | ✅ | ✅ Ses fichiers uniquement | ✅ Ses fichiers uniquement |
| **guest** | ❌ | ✅ | ❌ | ❌ | ✅ Ses fichiers uniquement |

### Cycle de vie d'un compte invité

```
1. Création par april_user → Code 6 chiffres généré et envoyé par email
2. Invité reçoit email → Code valide 24h (configurable)
3. Invité se connecte avec email + code → Token généré
4. Compte actif pendant 3 jours (configurable)
5. Expiration automatique → Compte désactivé + fichiers supprimés
```

## Architecture

### Nouveaux composants

#### Base de données (database.js)

**Tables ajoutées :**

- `users` : Utilisateurs de l'application (remplace utilisateurs hardcodés)
- `guest_accounts` : Comptes invités temporaires
- `file_ownership` : Propriété et tracking des fichiers

**Settings ajoutés :**

```javascript
guestAccountExpirationDays: '3'        // Durée de vie des comptes
guestCodeExpirationHours: '24'        // Validité du code de vérification
guestCodeLength: '6'                  // Longueur du code
enableGuestAccounts: 'true'           // Activer/désactiver le système
```

#### Service Email (emailService.js)

Service utilisant nodemailer pour :
- Envoyer les codes de vérification
- Notifier les expirations imminentes

**Configuration requise (.env) :**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre_email@gmail.com
SMTP_PASSWORD=votre_mot_de_passe_app
SMTP_FROM_EMAIL=noreply@shareazure.com
```

#### Migration des utilisateurs (migrateUsers.js)

Script exécuté au démarrage pour :
- Migrer les utilisateurs hardcodés vers la DB
- Créer un utilisateur APRIL de test (`april` / `april123`)

#### Middlewares d'authentification (server.js)

- `authenticateUser()` : Vérifie token utilisateur
- `authenticateGuest()` : Vérifie token invité et expiration
- `authenticateUserOrGuest()` : Accepte les deux types
- `requireRole(...roles)` : Vérifie rôles spécifiques

## API Endpoints

### Gestion des invités

#### POST /api/admin/guest-accounts
Créer un compte invité (admin ou april_user uniquement)

**Auth :** Bearer token user

**Body :**
```json
{
  "email": "invite@example.com"
}
```

**Réponse :**
```json
{
  "success": true,
  "guest": {
    "guestId": "uuid",
    "email": "invite@example.com",
    "codeExpiresAt": "2026-02-08T10:00:00Z",
    "accountExpiresAt": "2026-02-10T10:00:00Z",
    "emailSent": true
  },
  "message": "Compte invité créé. Le code de vérification a été envoyé par email."
}
```

#### POST /api/guest/login
Connexion invité avec code de vérification

**Auth :** Aucune (endpoint public)

**Body :**
```json
{
  "email": "invite@example.com",
  "code": "123456"
}
```

**Réponse :**
```json
{
  "success": true,
  "token": "guest_token_base64",
  "guest": {
    "id": 1,
    "guestId": "uuid",
    "email": "invite@example.com",
    "accountExpiresAt": "2026-02-10T10:00:00Z"
  }
}
```

#### GET /api/admin/guest-accounts
Liste des comptes invités

**Auth :** Bearer token user (admin ou april_user)

**Réponse :**
```json
{
  "success": true,
  "guests": [
    {
      "id": 1,
      "guestId": "uuid",
      "email": "invite@example.com",
      "is_active": 1,
      "account_expires_at": "2026-02-10T10:00:00Z",
      "creator_username": "april",
      "file_count": 3,
      "isExpired": false,
      "daysRemaining": 2
    }
  ],
  "stats": {
    "total": 1,
    "active": 1,
    "expired": 0,
    "disabled": 0
  }
}
```

#### PUT /api/admin/guest-accounts/:guestId/disable
Désactiver un compte invité

**Auth :** Bearer token user (admin ou créateur du compte)

**Réponse :**
```json
{
  "success": true,
  "message": "Compte invité désactivé"
}
```

#### DELETE /api/admin/guest-accounts/:guestId
Supprimer un compte invité et tous ses fichiers

**Auth :** Bearer token user (admin ou créateur du compte)

**Réponse :**
```json
{
  "success": true,
  "message": "Compte invité et fichiers supprimés",
  "stats": {
    "filesDeleted": 3,
    "errors": 0
  }
}
```

### Upload et gestion de fichiers

#### POST /api/upload
Upload d'un fichier (modifié pour tracking)

**Auth :** Bearer token (user OU guest)

**Changements :**
- Authentification obligatoire
- Enregistrement dans `file_ownership`
- Tracking du propriétaire (user_id ou guest_id)

#### GET /api/files
Liste des fichiers filtrée selon permissions

**Auth :** Bearer token (user OU guest)

**Filtrage automatique :**
- Guest : uniquement ses fichiers
- User : uniquement ses fichiers
- April_user : ses fichiers + fichiers de ses invités
- Admin : tous les fichiers

#### DELETE /api/files/:blobName
Suppression de fichier avec vérification de permissions

**Auth :** Bearer token user (PAS les guests)

**Permissions :**
- Guest : ❌ Interdit
- User : ✅ Ses fichiers uniquement
- April_user : ✅ Ses fichiers + fichiers de ses invités
- Admin : ✅ Tous les fichiers

## Cleanup automatique

### Tâche de nettoyage (toutes les minutes)

1. Détecte les comptes expirés
2. Récupère la liste des fichiers de chaque invité
3. Supprime les fichiers d'Azure Blob Storage
4. Supprime les enregistrements de `file_ownership`
5. Désactive le compte dans `guest_accounts`
6. Log l'opération

### Tâche de notification (quotidienne à 9h)

Envoie un email aux invités dont le compte expire dans moins de 24h.

## Utilisation

### Côté utilisateur APRIL

1. Se connecter avec son compte APRIL
2. Aller dans la section "Comptes Invités"
3. Cliquer sur "Créer un invité"
4. Saisir l'email du partenaire
5. Le système envoie automatiquement le code

### Côté invité

1. Recevoir l'email avec le code à 6 chiffres
2. Aller sur la page de connexion invité
3. Saisir email + code
4. Uploader des fichiers (pas de partage ni suppression)
5. Le compte expire automatiquement après 3 jours

## Sécurité

### Protections implémentées

- ✅ Codes hashés avec bcrypt (10 rounds)
- ✅ Codes à usage unique
- ✅ Expiration des codes (24h par défaut)
- ✅ Expiration des comptes (3 jours par défaut)
- ✅ Vérification de l'expiration à chaque requête
- ✅ Tokens distincts users/guests
- ✅ Suppression automatique des données
- ✅ Audit logs pour toutes les opérations

### Recommandations production

1. **SMTP sécurisé** : Utiliser SendGrid, AWS SES ou équivalent
2. **HTTPS obligatoire** : Forcer SSL/TLS
3. **Rate limiting** : Limiter les tentatives de login guest
4. **JWT** : Remplacer les tokens Base64 par JWT
5. **Monitoring** : Alertes si cleanup échoue
6. **Backup DB** : Sauvegarder avant chaque cleanup

## Tests

### Scénarios de test

#### Test 1 : Création et login invité

```bash
# 1. Créer un invité
curl -X POST http://localhost:3000/api/admin/guest-accounts \
  -H "Authorization: Bearer <april_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 2. Login invité (utiliser le code reçu par email)
curl -X POST http://localhost:3000/api/guest/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "123456"}'

# 3. Upload un fichier
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer <guest_token>" \
  -F "file=@test.pdf"
```

#### Test 2 : Filtrage des fichiers

```bash
# Invité voit uniquement ses fichiers
curl http://localhost:3000/api/files \
  -H "Authorization: Bearer <guest_token>"

# April_user voit ses fichiers + ceux de ses invités
curl http://localhost:3000/api/files \
  -H "Authorization: Bearer <april_token>"
```

#### Test 3 : Restrictions suppression

```bash
# Invité essaie de supprimer (DOIT ÉCHOUER)
curl -X DELETE http://localhost:3000/api/files/test.pdf \
  -H "Authorization: Bearer <guest_token>"
# → 401 Unauthorized

# April_user supprime fichier d'un invité (DOIT RÉUSSIR)
curl -X DELETE http://localhost:3000/api/files/test.pdf \
  -H "Authorization: Bearer <april_token>"
# → 200 OK
```

#### Test 4 : Cleanup automatique

```bash
# Forcer l'expiration d'un compte (pour test)
sqlite3 backend/shareazure.db
> UPDATE guest_accounts
  SET account_expires_at = datetime('now', '-1 minute')
  WHERE email = 'test@example.com';

# Attendre 1-2 minutes
# Vérifier les logs du serveur : "compte(s) invité(s) expiré(s)"
# Vérifier que les fichiers ont été supprimés
```

## Dépannage

### L'email n'est pas envoyé

**Symptôme :** `emailSent: false` dans la réponse de création

**Solutions :**
1. Vérifier les variables SMTP dans `.env`
2. Tester : `curl http://localhost:3000/api/health` doit mentionner la config email
3. Consulter les logs serveur pour les erreurs SMTP
4. Pour Gmail : utiliser un "mot de passe d'application"

### Le code ne fonctionne pas

**Symptôme :** "Email ou code invalide" lors du login

**Causes possibles :**
1. Code déjà utilisé
2. Code expiré (> 24h)
3. Compte désactivé
4. Email incorrect

**Vérification DB :**
```sql
SELECT email, code_used, code_expires_at, is_active
FROM guest_accounts
WHERE email = 'invite@example.com';
```

### Les fichiers ne sont pas supprimés

**Symptôme :** Compte désactivé mais fichiers restent dans Azure

**Solutions :**
1. Vérifier les logs : "Nettoyage de X compte(s)"
2. Vérifier la connexion Azure (droits de suppression)
3. Vérifier `file_ownership` : `SELECT * FROM file_ownership WHERE uploaded_by_guest_id = X;`

### Guest ne voit pas ses fichiers

**Symptôme :** GET /api/files retourne `{ files: [] }` pour un invité

**Causes :**
1. Fichiers uploadés avant implémentation du tracking
2. Token expiré ou invalide
3. Compte désactivé

**Vérification :**
```sql
SELECT fo.*, ga.email
FROM file_ownership fo
JOIN guest_accounts ga ON fo.uploaded_by_guest_id = ga.id
WHERE ga.email = 'invite@example.com';
```

## Roadmap / Améliorations futures

### Court terme
- [ ] Interface admin web pour gestion des invités
- [ ] Interface invité simplifiée (upload uniquement)
- [ ] Quotas de fichiers par invité
- [ ] Export CSV de l'historique des invités

### Moyen terme
- [ ] Renouvellement de compte invité
- [ ] Durée d'expiration personnalisable par invité
- [ ] Notifications SMS en plus de l'email
- [ ] Dashboard avec métriques des invités

### Long terme
- [ ] Migration vers JWT
- [ ] Intégration Azure AD B2C
- [ ] API REST complète (OpenAPI/Swagger)
- [ ] Multi-tenancy (plusieurs organisations)

## Support

Pour toute question ou problème :
1. Consulter les logs serveur : `tail -f logs/server.log`
2. Vérifier la DB : `sqlite3 backend/shareazure.db`
3. Tester les endpoints avec curl/Postman
4. Consulter le code source : `backend/server.js` lignes 1700-2100

---

**Version :** 1.0.0
**Date :** 2026-02-07
**Auteur :** Claude Code

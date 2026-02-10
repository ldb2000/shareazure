# Exemples d'utilisation de l'API - Système de Comptes Invités

**Date :** 2026-02-07

## Configuration

```bash
# Variables d'environnement
export API_BASE="http://localhost:3000"
export APRIL_USERNAME="april"
export APRIL_PASSWORD="april123"
export TEST_EMAIL="invite@example.com"
```

---

## 1. Authentification Utilisateur APRIL

### Login

```bash
curl -X POST "${API_BASE}/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${APRIL_USERNAME}\",
    \"password\": \"${APRIL_PASSWORD}\"
  }" | jq

# Réponse :
# {
#   "success": true,
#   "token": "dXNlcjozOmFwcmlsOjE3MzgzMjA...",
#   "user": {
#     "id": 3,
#     "username": "april",
#     "name": "Utilisateur APRIL",
#     "role": "april_user",
#     "email": "april@april.fr"
#   }
# }

# Sauvegarder le token
export APRIL_TOKEN=$(curl -s -X POST "${API_BASE}/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${APRIL_USERNAME}\",\"password\":\"${APRIL_PASSWORD}\"}" | jq -r '.token')

echo "Token APRIL: $APRIL_TOKEN"
```

### Vérifier le token

```bash
curl -X POST "${API_BASE}/api/user/verify" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "user": {
#     "id": 3,
#     "username": "april",
#     "name": "Utilisateur APRIL",
#     "role": "april_user",
#     "email": "april@april.fr"
#   }
# }
```

---

## 2. Gestion des Comptes Invités

### Créer un compte invité

```bash
curl -X POST "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\"
  }" | jq

# Réponse :
# {
#   "success": true,
#   "guest": {
#     "id": 1,
#     "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#     "email": "invite@example.com",
#     "codeExpiresAt": "2026-02-08T10:00:00.000Z",
#     "accountExpiresAt": "2026-02-10T10:00:00.000Z",
#     "emailSent": false
#   },
#   "message": "Compte invité créé mais l'email n'a pas pu être envoyé. Code: 123456"
# }

# Sauvegarder le guest_id
export GUEST_ID=$(curl -s -X POST "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\"}" | jq -r '.guest.guestId')

echo "Guest ID: $GUEST_ID"
```

### Lister les invités

```bash
curl -X GET "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "guests": [
#     {
#       "id": 1,
#       "guest_id": "a1b2c3d4-...",
#       "email": "invite@example.com",
#       "is_active": 1,
#       "account_expires_at": "2026-02-10T10:00:00.000Z",
#       "creator_username": "april",
#       "file_count": 0,
#       "isExpired": false,
#       "daysRemaining": 3,
#       "hoursRemaining": 72
#     }
#   ],
#   "stats": {
#     "total": 1,
#     "active": 1,
#     "expired": 0,
#     "disabled": 0
#   }
# }
```

### Désactiver un invité

```bash
curl -X PUT "${API_BASE}/api/admin/guest-accounts/${GUEST_ID}/disable" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "message": "Compte invité désactivé"
# }
```

### Supprimer un invité et ses fichiers

```bash
curl -X DELETE "${API_BASE}/api/admin/guest-accounts/${GUEST_ID}" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "message": "Compte invité et fichiers supprimés",
#   "stats": {
#     "filesDeleted": 2,
#     "errors": 0
#   }
# }
```

---

## 3. Connexion Invité

### Récupérer le code depuis la DB (DEV uniquement)

```bash
# En développement, si l'email n'est pas configuré
export GUEST_CODE=$(sqlite3 backend/shareazure.db \
  "SELECT verification_code FROM guest_accounts WHERE email = '${TEST_EMAIL}' LIMIT 1;")

echo "Code invité: $GUEST_CODE"
```

### Login invité avec code

```bash
curl -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"code\": \"${GUEST_CODE}\"
  }" | jq

# Réponse :
# {
#   "success": true,
#   "token": "Z3Vlc3Q6YTFiMmMzZDQtZTVmNi03ODkwLWFiY2QtZWYxMjM0NTY3ODkwOjE3MzgzMjA...",
#   "guest": {
#     "id": 1,
#     "guestId": "a1b2c3d4-...",
#     "email": "invite@example.com",
#     "accountExpiresAt": "2026-02-10T10:00:00.000Z"
#   }
# }

# Sauvegarder le token
export GUEST_TOKEN=$(curl -s -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"code\":\"${GUEST_CODE}\"}" | jq -r '.token')

echo "Token invité: $GUEST_TOKEN"
```

### Tentative de réutilisation du code (doit échouer)

```bash
curl -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"code\": \"${GUEST_CODE}\"
  }" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Ce code a déjà été utilisé. Votre compte est actif, utilisez votre token."
# }
```

---

## 4. Upload de Fichiers

### Upload par invité

```bash
# Créer un fichier de test
echo "Contenu du fichier de test" > /tmp/test-file.txt

# Upload
curl -X POST "${API_BASE}/api/upload" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" \
  -F "file=@/tmp/test-file.txt" | jq

# Réponse :
# {
#   "success": true,
#   "message": "Fichier uploadé avec succès",
#   "file": {
#     "blobName": "test-file.txt",
#     "originalName": "test-file.txt",
#     "displayName": "test-file.txt",
#     "size": 30,
#     "contentType": "text/plain",
#     "url": "https://..."
#   }
# }
```

### Upload multiple

```bash
# Créer plusieurs fichiers
echo "Fichier 1" > /tmp/file1.txt
echo "Fichier 2" > /tmp/file2.txt

curl -X POST "${API_BASE}/api/upload/multiple" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" \
  -F "files=@/tmp/file1.txt" \
  -F "files=@/tmp/file2.txt" | jq

# Réponse :
# {
#   "success": true,
#   "message": "2 fichier(s) uploadé(s) avec succès",
#   "files": [...]
# }
```

### Upload sans authentification (doit échouer)

```bash
curl -X POST "${API_BASE}/api/upload" \
  -F "file=@/tmp/test-file.txt" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Token d'authentification manquant"
# }
```

---

## 5. Liste des Fichiers

### Liste par invité (voit uniquement ses fichiers)

```bash
curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "count": 2,
#   "files": [
#     {
#       "name": "test-file.txt",
#       "originalName": "test-file.txt",
#       "size": 30,
#       "contentType": "text/plain",
#       "uploadedBy": "invite@example.com",
#       "ownerType": "guest"
#     }
#   ],
#   "guest": {
#     "email": "invite@example.com"
#   }
# }
```

### Liste par april_user (voit ses fichiers + ceux de ses invités)

```bash
curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "count": 5,
#   "files": [
#     {
#       "name": "my-file.pdf",
#       "uploadedBy": "april",
#       "ownerType": "user"
#     },
#     {
#       "name": "guest-file.txt",
#       "uploadedBy": "invite@example.com",
#       "ownerType": "guest"
#     }
#   ],
#   "user": {
#     "role": "april_user",
#     "username": "april"
#   }
# }
```

### Liste par admin (voit tout)

```bash
# Login admin
export ADMIN_TOKEN=$(curl -s -X POST "${API_BASE}/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq

# Voit tous les fichiers de tous les utilisateurs
```

---

## 6. Suppression de Fichiers

### Tentative de suppression par invité (doit échouer)

```bash
curl -X DELETE "${API_BASE}/api/files/test-file.txt" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Authentification utilisateur requise"
# }
```

### Suppression par april_user (fichier de son invité)

```bash
curl -X DELETE "${API_BASE}/api/files/test-file.txt" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq

# Réponse :
# {
#   "success": true,
#   "message": "Fichier supprimé avec succès"
# }
```

### Tentative de suppression d'un fichier d'un autre user (doit échouer)

```bash
# Login user standard
export USER_TOKEN=$(curl -s -X POST "${API_BASE}/api/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}' | jq -r '.token')

# Tenter de supprimer un fichier d'april
curl -X DELETE "${API_BASE}/api/files/april-file.pdf" \
  -H "Authorization: Bearer ${USER_TOKEN}" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Vous n'avez pas la permission de supprimer ce fichier"
# }
```

---

## 7. Tests de Sécurité

### Token invalide

```bash
curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer INVALID_TOKEN" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Token invalide"
# }
```

### Code invité invalide

```bash
curl -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"code\": \"999999\"
  }" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Email ou code invalide"
# }
```

### Compte invité expiré

```bash
# Forcer l'expiration (DEV uniquement)
sqlite3 backend/shareazure.db <<EOF
UPDATE guest_accounts
SET account_expires_at = datetime('now', '-1 minute')
WHERE email = '${TEST_EMAIL}';
EOF

# Tenter d'utiliser le token
curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" | jq

# Réponse :
# {
#   "success": false,
#   "error": "Compte invité expiré"
# }
```

---

## 8. Cleanup Automatique

### Tester le cleanup manuel

```bash
# Forcer l'expiration d'un compte
sqlite3 backend/shareazure.db <<EOF
UPDATE guest_accounts
SET account_expires_at = datetime('now', '-1 minute')
WHERE email = '${TEST_EMAIL}';
EOF

# Attendre 1-2 minutes
# Consulter les logs du serveur :
tail -f logs/server.log

# Doit afficher :
# 🧹 Nettoyage de 1 compte(s) invité(s) expiré(s)...
#   - Guest invite@example.com (2 fichier(s))
# ✅ Nettoyage terminé: 2 fichier(s) supprimé(s)

# Vérifier que les fichiers sont supprimés
curl -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.count'
```

---

## 9. Statistiques et Monitoring

### Stats des invités

```bash
curl -X GET "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | jq '.stats'

# Réponse :
# {
#   "total": 5,
#   "active": 3,
#   "expired": 1,
#   "disabled": 1
# }
```

### Détails d'un invité spécifique

```bash
curl -X GET "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | \
  jq ".guests[] | select(.guest_id == \"${GUEST_ID}\")"

# Affiche tous les détails de l'invité
```

---

## 10. Scénario Complet

### Workflow de bout en bout

```bash
#!/bin/bash
set -e

API_BASE="http://localhost:3000"
TEST_EMAIL="full-test@example.com"

echo "🎬 Scénario complet : Création invité → Upload → Cleanup"
echo "========================================================="

# 1. Login april_user
echo "1️⃣  Login april_user..."
APRIL_TOKEN=$(curl -s -X POST "${API_BASE}/api/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"april","password":"april123"}' | jq -r '.token')
echo "✅ Token obtenu"

# 2. Créer invité
echo "2️⃣  Création compte invité..."
GUEST_RESPONSE=$(curl -s -X POST "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\"}")
GUEST_ID=$(echo "$GUEST_RESPONSE" | jq -r '.guest.guestId')
echo "✅ Invité créé: $GUEST_ID"

# 3. Récupérer code
echo "3️⃣  Récupération code..."
CODE=$(sqlite3 shareazure.db "SELECT verification_code FROM guest_accounts WHERE email = '${TEST_EMAIL}';")
echo "✅ Code: $CODE"

# 4. Login invité
echo "4️⃣  Login invité..."
GUEST_TOKEN=$(curl -s -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"code\":\"${CODE}\"}" | jq -r '.token')
echo "✅ Token invité obtenu"

# 5. Upload fichier
echo "5️⃣  Upload fichier..."
echo "Test data" > /tmp/full-test.txt
UPLOAD_RESPONSE=$(curl -s -X POST "${API_BASE}/api/upload" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" \
  -F "file=@/tmp/full-test.txt")
BLOB_NAME=$(echo "$UPLOAD_RESPONSE" | jq -r '.file.blobName')
echo "✅ Fichier uploadé: $BLOB_NAME"

# 6. Vérifier fichiers
echo "6️⃣  Vérification fichiers..."
FILE_COUNT=$(curl -s -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${GUEST_TOKEN}" | jq '.count')
echo "✅ Invité voit $FILE_COUNT fichier(s)"

# 7. Forcer expiration
echo "7️⃣  Forcer expiration..."
sqlite3 shareazure.db "UPDATE guest_accounts SET account_expires_at = datetime('now', '-1 minute') WHERE guest_id = '${GUEST_ID}';"
echo "✅ Expiration forcée"

# 8. Attendre cleanup
echo "8️⃣  Attendre cleanup automatique (60s)..."
sleep 65

# 9. Vérifier suppression
echo "9️⃣  Vérification suppression..."
DB_COUNT=$(sqlite3 shareazure.db "SELECT COUNT(*) FROM file_ownership WHERE blob_name = '${BLOB_NAME}';")
if [ "$DB_COUNT" -eq "0" ]; then
    echo "✅ Fichier supprimé de la DB"
else
    echo "❌ Fichier toujours en DB"
fi

echo ""
echo "🎉 Scénario terminé avec succès !"
```

---

## Conseils d'utilisation

### Utiliser jq pour filtrer

```bash
# Voir uniquement les emails des invités actifs
curl -s -X GET "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" | \
  jq '.guests[] | select(.is_active == 1) | .email'

# Compter les fichiers par type de propriétaire
curl -s -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | \
  jq '[.files[] | .ownerType] | group_by(.) | map({type: .[0], count: length})'
```

### Debugger avec verbose

```bash
# Voir les headers HTTP
curl -v -X POST "${API_BASE}/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@test.com\",\"code\":\"123456\"}"

# Voir le temps de réponse
curl -w "\nTemps total: %{time_total}s\n" \
  -X GET "${API_BASE}/api/files" \
  -H "Authorization: Bearer ${GUEST_TOKEN}"
```

### Sauvegarder les réponses

```bash
# Sauvegarder dans un fichier
curl -X GET "${API_BASE}/api/admin/guest-accounts" \
  -H "Authorization: Bearer ${APRIL_TOKEN}" \
  -o guests-$(date +%Y%m%d).json

# Comparer deux exports
diff guests-20260207.json guests-20260208.json
```

---

**Documentation :** `docs/API_EXAMPLES.md`
**Date :** 2026-02-07
**Version :** 1.0.0

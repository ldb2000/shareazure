#!/bin/bash
# ShareAzure — Exécution automatisée des tests
# URL de base
BASE="http://127.0.0.1:3000"
PASS=0
FAIL=0
WARN=0
RESULTS=""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_result() {
  local id="$1" name="$2" status="$3" detail="$4"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    RESULTS+="${GREEN}✅ $id — $name${NC}\n"
  elif [ "$status" = "FAIL" ]; then
    FAIL=$((FAIL+1))
    RESULTS+="${RED}❌ $id — $name — $detail${NC}\n"
  else
    WARN=$((WARN+1))
    RESULTS+="${YELLOW}⚠️  $id — $name — $detail${NC}\n"
  fi
  echo -e "  $([ "$status" = "PASS" ] && echo "✅" || ([ "$status" = "FAIL" ] && echo "❌" || echo "⚠️")) $id $name $([ -n "$detail" ] && echo "[$detail]")"
}

expect_status() {
  local id="$1" name="$2" expected="$3" actual="$4" detail="$5"
  if [ "$actual" = "$expected" ]; then
    log_result "$id" "$name" "PASS"
  else
    log_result "$id" "$name" "FAIL" "expected=$expected got=$actual $detail"
  fi
}

# Obtenir tokens
echo "=== Obtention des tokens ==="
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/admin/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | head -1 | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "  Admin login: $ADMIN_CODE (token: ${ADMIN_TOKEN:0:20}...)"

USER_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/user/login" -H "Content-Type: application/json" -d '{"username":"user","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_TOKEN=$(echo "$USER_RESP" | head -1 | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "  User login: $USER_CODE (token: ${USER_TOKEN:0:20}...)"

echo ""
echo "============================================"
echo "  1. AUTHENTIFICATION & SÉCURITÉ"
echo "============================================"

# 1.1 Login admin valide
expect_status "1.1" "Login admin valide" "200" "$ADMIN_CODE"

# 1.2 Login admin invalide
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"wrongpass"}')
expect_status "1.2" "Login admin invalide" "401" "$CODE"

# 1.3 Login user valide
expect_status "1.3" "Login user valide" "200" "$USER_CODE"

# 1.4 Login user invalide
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/user/login" -H "Content-Type: application/json" -d '{"username":"user","password":"wrongpass"}')
expect_status "1.4" "Login user invalide" "401" "$CODE"

# 1.5 Username case-insensitive
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/login" -H "Content-Type: application/json" -d '{"username":"Admin","password":"admin123"}')
expect_status "1.5" "Username case-insensitive" "200" "$CODE"

# 1.6 Password case-sensitive
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123"}')
expect_status "1.6" "Password case-sensitive (rejeté)" "401" "$CODE"

# 1.7 Token expiré — skip (tokens n'expirent pas actuellement = faille connue)
log_result "1.7" "Token expiré" "WARN" "Tokens sans expiration (faille CRIT-01)"

# 1.8 Route admin sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/users")
expect_status "1.8" "Route admin sans auth → 401" "401" "$CODE"

# 1.9 Route admin avec token user
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/users" -H "Authorization: Bearer $USER_TOKEN")
if [ "$CODE" = "403" ] || [ "$CODE" = "401" ]; then
  log_result "1.9" "Route admin avec token user → 403" "PASS"
else
  log_result "1.9" "Route admin avec token user → 403" "FAIL" "got=$CODE"
fi

# 1.10 Health check
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
expect_status "1.10" "Health check public" "200" "$CODE"

# 1.11 — skip (besoin d'un invité actif)
log_result "1.11" "Login invité valide" "WARN" "Skip — pas d'invité de test"

# 1.12 — skip
log_result "1.12" "Login invité expiré" "WARN" "Skip — pas d'invité expiré"

# 1.13 Vérification token admin
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/verify" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "1.13" "Verify token admin" "200" "$CODE"

echo ""
echo "============================================"
echo "  SÉCURITÉ — Routes non protégées"
echo "============================================"

# Test routes qui devraient être protégées
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/settings")
if [ "$CODE" = "200" ]; then
  log_result "SEC-01" "GET /api/settings SANS auth" "FAIL" "ACCESSIBLE (devrait être 401)"
else
  log_result "SEC-01" "GET /api/settings protégé" "PASS"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/settings" -H "Content-Type: application/json" -d '{}')
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-02" "PUT /api/settings protégé" "PASS"
else
  log_result "SEC-02" "PUT /api/settings SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/settings/reset" -H "Content-Type: application/json")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-03" "POST /api/settings/reset protégé" "PASS"
else
  log_result "SEC-03" "POST /api/settings/reset SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/logs")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-04" "GET /api/admin/logs protégé" "PASS"
else
  log_result "SEC-04" "GET /api/admin/logs SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/admin/logs" -H "Content-Type: application/json")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-05" "DELETE /api/admin/logs protégé" "PASS"
else
  log_result "SEC-05" "DELETE /api/admin/logs SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/email-domains")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-06" "GET /api/admin/email-domains protégé" "PASS"
else
  log_result "SEC-06" "GET /api/admin/email-domains SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

# Token forgé
FORGED=$(echo -n "user:1:admin:9999999999" | base64)
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/users" -H "Authorization: Bearer $FORGED")
if [ "$CODE" = "200" ]; then
  log_result "SEC-07" "Token forgé Base64 ACCEPTÉ" "FAIL" "FAILLE CRITIQUE — token forgé donne accès admin"
else
  log_result "SEC-07" "Token forgé rejeté" "PASS"
fi

# Download sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/download/test-file.txt")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-08" "Download sans auth protégé" "PASS"
else
  log_result "SEC-08" "Download sans auth" "FAIL" "code=$CODE (devrait être 401)"
fi

# Preview sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/preview/test-file.txt")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-09" "Preview sans auth protégé" "PASS"
else
  log_result "SEC-09" "Preview sans auth" "FAIL" "code=$CODE (devrait être 401)"
fi

# Container init sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/container/init")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-10" "Container init protégé" "PASS"
else
  log_result "SEC-10" "Container init SANS auth" "FAIL" "ACCESSIBLE code=$CODE"
fi

# Share generate sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/share/generate" -H "Content-Type: application/json" -d '{"blobName":"test","password":"test"}')
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-11" "Share generate protégé" "PASS"
else
  log_result "SEC-11" "Share generate SANS auth" "FAIL" "code=$CODE"
fi

# Share send-email sans auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/share/send-email" -H "Content-Type: application/json" -d '{}')
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  log_result "SEC-12" "Share send-email protégé" "PASS"
else
  log_result "SEC-12" "Share send-email SANS auth" "FAIL" "code=$CODE"
fi

echo ""
echo "============================================"
echo "  2. GESTION DES FICHIERS"
echo "============================================"

# 2.1 Upload fichier simple
UPLOAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/tmp/test-upload.txt" 2>/dev/null)
# Créer le fichier test d'abord
echo "Ceci est un fichier de test ShareAzure" > /tmp/test-upload.txt
UPLOAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/tmp/test-upload.txt")
UPLOAD_CODE=$(echo "$UPLOAD_RESP" | tail -1)
UPLOAD_BLOB=$(echo "$UPLOAD_RESP" | head -1 | grep -o '"blobName":"[^"]*"' | cut -d'"' -f4)
expect_status "2.1" "Upload fichier simple" "200" "$UPLOAD_CODE"
echo "  → Blob: $UPLOAD_BLOB"

# 2.4 Liste fichiers
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files" -H "Authorization: Bearer $USER_TOKEN")
expect_status "2.4" "Liste fichiers (auth)" "200" "$CODE"

# 2.5 Liste fichiers user
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/files" -H "Authorization: Bearer $USER_TOKEN")
expect_status "2.5" "Liste fichiers user" "200" "$CODE"

# 2.6 Téléchargement
if [ -n "$UPLOAD_BLOB" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/download/$UPLOAD_BLOB" -H "Authorization: Bearer $USER_TOKEN")
  expect_status "2.6" "Téléchargement fichier" "200" "$CODE"
else
  log_result "2.6" "Téléchargement fichier" "WARN" "Pas de blob uploadé"
fi

# 2.8 Création dossier
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/user/folders/create" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"folderName":"test-folder","parentPath":""}')
expect_status "2.8" "Création dossier" "200" "$CODE"

echo ""
echo "============================================"
echo "  3. PARTAGE DE FICHIERS"
echo "============================================"

# 3.1 Générer lien de partage
if [ -n "$UPLOAD_BLOB" ]; then
  SHARE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/share/generate" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"blobName\":\"$UPLOAD_BLOB\",\"password\":\"Test1234!\",\"recipientEmail\":\"test@gmail.com\",\"expiresInMinutes\":60}")
  SHARE_CODE=$(echo "$SHARE_RESP" | tail -1)
  SHARE_LINK=$(echo "$SHARE_RESP" | head -1 | grep -o '"linkId":"[^"]*"' | cut -d'"' -f4)
  expect_status "3.1" "Générer lien de partage" "200" "$SHARE_CODE"
  echo "  → LinkId: $SHARE_LINK"
else
  log_result "3.1" "Générer lien de partage" "WARN" "Pas de blob"
fi

# 3.2 Partage sans mot de passe
if [ -n "$UPLOAD_BLOB" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/share/generate" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"blobName\":\"$UPLOAD_BLOB\",\"recipientEmail\":\"test@gmail.com\"}")
  if [ "$CODE" = "400" ]; then
    log_result "3.2" "Partage sans mdp → 400" "PASS"
  else
    log_result "3.2" "Partage sans mdp accepté" "FAIL" "code=$CODE (devrait être 400)"
  fi
fi

# 3.5 Page téléchargement via lien
if [ -n "$SHARE_LINK" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/share/download/$SHARE_LINK")
  expect_status "3.5" "Page téléchargement share" "200" "$CODE"
fi

# 3.6 Téléchargement avec bon mdp
if [ -n "$SHARE_LINK" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/share/download/$SHARE_LINK" \
    -H "Content-Type: application/json" -d '{"password":"Test1234!","email":"test@gmail.com"}')
  expect_status "3.6" "Download share bon mdp" "200" "$CODE"
fi

# 3.7 Mauvais mot de passe
if [ -n "$SHARE_LINK" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/share/download/$SHARE_LINK" \
    -H "Content-Type: application/json" -d '{"password":"wrong"}')
  expect_status "3.7" "Download share mauvais mdp" "401" "$CODE"
fi

# 3.13 Suppression lien
if [ -n "$SHARE_LINK" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/share/$SHARE_LINK" \
    -H "Authorization: Bearer $USER_TOKEN")
  expect_status "3.13" "Suppression lien partage" "200" "$CODE"
fi

# 3.14 Historique partages
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/share/history" -H "Authorization: Bearer $USER_TOKEN")
expect_status "3.14" "Historique partages" "200" "$CODE"

# 3.18 Liens partage user
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/share-links" -H "Authorization: Bearer $USER_TOKEN")
expect_status "3.18" "Liens partage user" "200" "$CODE"

echo ""
echo "============================================"
echo "  4. CORBEILLE"
echo "============================================"

# 4.1 Mettre en corbeille
if [ -n "$UPLOAD_BLOB" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/files/trash" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"blobName\":\"$UPLOAD_BLOB\"}")
  expect_status "4.1" "Mettre en corbeille" "200" "$CODE"
fi

# 4.2 Lister corbeille
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/trash" -H "Authorization: Bearer $USER_TOKEN")
expect_status "4.2" "Lister corbeille" "200" "$CODE"

# 4.3 Restaurer fichier
if [ -n "$UPLOAD_BLOB" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/files/restore" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"blobName\":\"$UPLOAD_BLOB\"}")
  expect_status "4.3" "Restaurer fichier" "200" "$CODE"
fi

# 4.7 Fichier corbeille invisible dans liste
# Re-trash pour tester
if [ -n "$UPLOAD_BLOB" ]; then
  curl -s -o /dev/null -X PUT "$BASE/api/files/trash" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"blobName\":\"$UPLOAD_BLOB\"}"
  FILES_LIST=$(curl -s "$BASE/api/files" -H "Authorization: Bearer $USER_TOKEN")
  if echo "$FILES_LIST" | grep -q "$UPLOAD_BLOB"; then
    log_result "4.7" "Fichier corbeille invisible" "FAIL" "Fichier trash visible dans la liste"
  else
    log_result "4.7" "Fichier corbeille invisible" "PASS"
  fi
fi

echo ""
echo "============================================"
echo "  5. PREVIEW & COMMENTAIRES"
echo "============================================"

# 5.7 Ajouter commentaire
if [ -n "$UPLOAD_BLOB" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/files/$UPLOAD_BLOB/comments" \
    -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
    -d '{"comment":"Test commentaire automatisé"}')
  expect_status "5.7" "Ajouter commentaire" "200" "$CODE"

  # 5.8 Lister commentaires
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/$UPLOAD_BLOB/comments" \
    -H "Authorization: Bearer $USER_TOKEN")
  expect_status "5.8" "Lister commentaires" "200" "$CODE"
fi

echo ""
echo "============================================"
echo "  6. ANNOTATIONS PDF"
echo "============================================"

# 6.6 Sauvegarder annotations (on utilise un blobName fictif)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/files/test.pdf/annotations" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"annotations":[{"page_number":1,"annotation_type":"text","data":{"x":10,"y":20,"text":"Test note","color":"#ff0000"}}]}')
expect_status "6.6" "Sauvegarder annotations" "200" "$CODE"

# 6.7 Charger annotations
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/test.pdf/annotations" \
  -H "Authorization: Bearer $USER_TOKEN")
expect_status "6.7" "Charger annotations" "200" "$CODE"

# 6.9 Supprimer annotations
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/files/test.pdf/annotations" \
  -H "Authorization: Bearer $USER_TOKEN")
expect_status "6.9" "Supprimer annotations" "200" "$CODE"

echo ""
echo "============================================"
echo "  7. COMPTES INVITÉS"
echo "============================================"

# 7.1 Créer invité
GUEST_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/admin/guest-accounts" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"email\":\"testguest-$(date +%s)@gmail.com\",\"duration\":\"3d\",\"name\":\"Test Guest\"}")
GUEST_CODE=$(echo "$GUEST_RESP" | tail -1)
GUEST_ID=$(echo "$GUEST_RESP" | head -1 | grep -o '"guestId":"[^"]*"' | cut -d'"' -f4)
if [ "$GUEST_CODE" = "200" ] || [ "$GUEST_CODE" = "201" ]; then
  log_result "7.1" "Créer invité (3 jours)" "PASS"
else
  log_result "7.1" "Créer invité (3 jours)" "FAIL" "code=$GUEST_CODE"
fi

# 7.8 Mes invités
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/my-guests" -H "Authorization: Bearer $USER_TOKEN")
expect_status "7.8" "Lister mes invités" "200" "$CODE"

echo ""
echo "============================================"
echo "  8. ÉQUIPES"
echo "============================================"

# 8.2 Lister équipes
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/teams" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "8.2" "Lister équipes" "200" "$CODE"

# 8.3 Détail équipe
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/teams/1" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "8.3" "Détail équipe" "200" "$CODE"

# 8.7 Lister membres
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/teams/1/members" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "8.7" "Lister membres équipe" "200" "$CODE"

# 8.14 Logo équipe
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/teams/1/logo")
expect_status "8.14" "Récupérer logo équipe" "200" "$CODE"

echo ""
echo "============================================"
echo "  9. RÔLES & PERMISSIONS"
echo "============================================"

# 9.1 Lister rôles
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/roles" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "9.1" "Lister rôles" "200" "$CODE"

# 9.2 Permissions d'un rôle
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/roles/user/permissions" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "9.2" "Permissions rôle user" "200" "$CODE"

# 9.7 Permissions propres
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/permissions" -H "Authorization: Bearer $USER_TOKEN")
expect_status "9.7" "Permissions propres user" "200" "$CODE"

echo ""
echo "============================================"
echo "  10. NOTIFICATIONS"
echo "============================================"

# 10.1 Lister notifications
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/notifications" -H "Authorization: Bearer $USER_TOKEN")
expect_status "10.1" "Lister notifications" "200" "$CODE"

# 10.3 Marquer toutes lues
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/notifications/read-all" -H "Authorization: Bearer $USER_TOKEN")
expect_status "10.3" "Marquer toutes lues" "200" "$CODE"

echo ""
echo "============================================"
echo "  11. FINOPS & COÛTS"
echo "============================================"

# 11.1 Dashboard FinOps user
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/finops/me" -H "Authorization: Bearer $USER_TOKEN")
expect_status "11.1" "FinOps user dashboard" "200" "$CODE"

# 11.6 Coûts globaux admin
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/costs" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "11.6" "Coûts globaux admin" "200" "$CODE"

# 11.7 Rapport FinOps admin
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/finops" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "11.7" "Rapport FinOps JSON" "200" "$CODE"

# 11.8 Rapport FinOps HTML
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/finops/html" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "11.8" "Rapport FinOps HTML" "200" "$CODE"

echo ""
echo "============================================"
echo "  12. STOCKAGE & TIERING"
echo "============================================"

# 12.5 Politiques tiering
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/tiering/policies" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "12.5" "Politiques tiering" "200" "$CODE"

# 12.11 Sync stockage
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/sync-storage" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "12.11" "Sync stockage Azure" "200" "$CODE"

# 12.12 Arbre stockage
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/storage/tree" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "12.12" "Arbre stockage" "200" "$CODE"

echo ""
echo "============================================"
echo "  13. ADMINISTRATION"
echo "============================================"

# 13.1 Lister utilisateurs
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "13.1" "Lister utilisateurs" "200" "$CODE"

# 13.8 Stats admin
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/stats" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "13.8" "Statistiques admin" "200" "$CODE"

# 13.9 Logs admin
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/logs" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "13.9" "Logs admin" "200" "$CODE"

# 13.11 Paramètres
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/settings" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "13.11" "Paramètres généraux" "200" "$CODE"

# 13.13 Domaines email
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/email-domains" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "13.13" "Domaines email" "200" "$CODE"

echo ""
echo "============================================"
echo "  14. EMAIL & SMTP"
echo "============================================"

# 14.1 Config email
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/email/config" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "14.1" "Config email" "200" "$CODE"

echo ""
echo "============================================"
echo "  15. RAPPORTS"
echo "============================================"

# 15.1 Générer rapport
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/report?period=week" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "15.1" "Rapport semaine" "200" "$CODE"

# 15.2 Télécharger rapport
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/report/download?period=month" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "15.2" "Download rapport mois" "200" "$CODE"

echo ""
echo "============================================"
echo "  16. ANTIVIRUS"
echo "============================================"

# 16.1 Scan auto (upload d'un fichier sain)
echo "Fichier sain pour test antivirus" > /tmp/test-av-clean.txt
AV_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/tmp/test-av-clean.txt")
AV_CODE=$(echo "$AV_RESP" | tail -1)
expect_status "16.1" "Upload fichier sain (scan OK)" "200" "$AV_CODE"

# 16.2 Upload EICAR (fichier test virus)
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/test-eicar.txt
AV_RESP2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/tmp/test-eicar.txt")
AV_CODE2=$(echo "$AV_RESP2" | tail -1)
if [ "$AV_CODE2" = "400" ] || [ "$AV_CODE2" = "403" ] || [ "$AV_CODE2" = "422" ]; then
  log_result "16.2" "Upload EICAR rejeté" "PASS"
else
  log_result "16.2" "Upload EICAR" "FAIL" "code=$AV_CODE2 — virus non détecté?"
fi

# 16.4 Stats scans
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/security/scan-stats" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "16.4" "Stats scans" "200" "$CODE"

echo ""
echo "============================================"
echo "  17. AUDIT"
echo "============================================"

# 17.1 Audit partages
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/audit/shares" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "17.1" "Audit partages" "200" "$CODE"

# 17.5 Audit fichiers
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/audit/files" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "17.5" "Audit fichiers" "200" "$CODE"

# 17.6 Audit activité
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/audit/activity" -H "Authorization: Bearer $ADMIN_TOKEN")
expect_status "17.6" "Audit activité" "200" "$CODE"

# 17.8 Sans permission
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/audit/shares" -H "Authorization: Bearer $USER_TOKEN")
if [ "$CODE" = "403" ]; then
  log_result "17.8" "Audit sans permission → 403" "PASS"
else
  log_result "17.8" "Audit sans permission" "FAIL" "code=$CODE (devrait être 403)"
fi

echo ""
echo "============================================"
echo "  18. BRANDING"
echo "============================================"

# 18.1 Info entreprise
RESP=$(curl -s "$BASE/api/company-info")
if echo "$RESP" | grep -q "companyName"; then
  log_result "18.1" "Info entreprise" "PASS"
else
  log_result "18.1" "Info entreprise" "FAIL" "Pas de companyName"
fi

# 18.2 Logo entreprise
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/company-logo")
expect_status "18.2" "Logo entreprise" "200" "$CODE"

echo ""
echo "============================================"
echo "  19. PORTAIL UPLOAD EXTERNE"
echo "============================================"

# 19.1 Créer demande upload
UP_REQ_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload-requests" \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Test upload externe","allowedEmail":"test@gmail.com","expiresInDays":7}')
UP_REQ_CODE=$(echo "$UP_REQ_RESP" | tail -1)
UP_REQ_ID=$(echo "$UP_REQ_RESP" | head -1 | grep -o '"requestId":"[^"]*"' | cut -d'"' -f4)
if [ "$UP_REQ_CODE" = "200" ] || [ "$UP_REQ_CODE" = "201" ]; then
  log_result "19.1" "Créer demande upload" "PASS"
else
  log_result "19.1" "Créer demande upload" "FAIL" "code=$UP_REQ_CODE"
fi

# 19.2 Page upload externe
if [ -n "$UP_REQ_ID" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/upload/$UP_REQ_ID")
  expect_status "19.2" "Page upload externe" "200" "$CODE"
fi

# 19.4 Upload lien invalide
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/upload/fake-invalid-id")
expect_status "19.4" "Upload lien invalide" "200" "$CODE" # Sert la page HTML, erreur côté client

echo ""
echo "============================================"
echo "  20. 2FA / OTP"
echo "============================================"

# 20.6 Statut 2FA
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/2fa" -H "Authorization: Bearer $USER_TOKEN")
expect_status "20.6" "Statut 2FA" "200" "$CODE"

echo ""
echo "============================================"
echo "  21. ENTRA ID / SSO"
echo "============================================"

# 21.4 Config auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/settings/auth")
expect_status "21.4" "Config auth modes" "200" "$CODE"

echo ""
echo "============================================"
echo "  22. BULK ACTIONS"
echo "============================================"

# 22.2 Bulk delete (fichiers de test)
echo "bulk test 1" > /tmp/bulk1.txt
echo "bulk test 2" > /tmp/bulk2.txt
curl -s -o /dev/null -X POST "$BASE/api/upload" -H "Authorization: Bearer $USER_TOKEN" -F "file=@/tmp/bulk1.txt"
curl -s -o /dev/null -X POST "$BASE/api/upload" -H "Authorization: Bearer $USER_TOKEN" -F "file=@/tmp/bulk2.txt"
log_result "22.1-5" "Bulk actions" "WARN" "Upload de test fait — bulk delete/download à tester manuellement"

echo ""
echo "============================================"
echo "  23. RESPONSIVE (pages HTML)"
echo "============================================"

# Vérifier que les pages se chargent
for page in "" "login.html" "user.html" "guest-login.html"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$page")
  if [ "$CODE" = "200" ]; then
    log_result "23.x" "Page /$page accessible" "PASS"
  else
    log_result "23.x" "Page /$page" "FAIL" "code=$CODE"
  fi
done

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/")
expect_status "23.x" "Page /admin/ accessible" "200" "$CODE"

echo ""
echo "============================================"
echo "  24. PERFORMANCE"
echo "============================================"

# 24.1 Temps de réponse health
TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE/api/health")
if (( $(echo "$TIME < 1.0" | bc -l) )); then
  log_result "24.1" "Health response time ${TIME}s" "PASS"
else
  log_result "24.1" "Health response time ${TIME}s" "FAIL" "Trop lent (>1s)"
fi

# 24.x Temps liste fichiers
TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE/api/files" -H "Authorization: Bearer $USER_TOKEN")
if (( $(echo "$TIME < 3.0" | bc -l) )); then
  log_result "24.3" "Files list response time ${TIME}s" "PASS"
else
  log_result "24.3" "Files list response time ${TIME}s" "FAIL" "Trop lent (>3s)"
fi

# Nettoyage
if [ -n "$UPLOAD_BLOB" ]; then
  curl -s -o /dev/null -X PUT "$BASE/api/files/trash/restore-all" -H "Authorization: Bearer $USER_TOKEN"
fi
rm -f /tmp/test-upload.txt /tmp/test-av-clean.txt /tmp/test-eicar.txt /tmp/bulk1.txt /tmp/bulk2.txt

echo ""
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         RÉSULTATS FINAUX                 ║"
echo "╠══════════════════════════════════════════╣"
printf "║  ✅ PASS : %-28s ║\n" "$PASS"
printf "║  ❌ FAIL : %-28s ║\n" "$FAIL"
printf "║  ⚠️  WARN : %-28s ║\n" "$WARN"
printf "║  TOTAL  : %-28s ║\n" "$((PASS+FAIL+WARN))"
echo "╠══════════════════════════════════════════╣"
TOTAL=$((PASS+FAIL+WARN))
if [ $TOTAL -gt 0 ]; then
  PCT=$((PASS * 100 / TOTAL))
  printf "║  TAUX DE RÉUSSITE : %-19s ║\n" "${PCT}%"
fi
echo "╚══════════════════════════════════════════╝"
echo ""

# Sauvegarder les résultats
echo "Tests exécutés: $((PASS+FAIL+WARN))" > /home/debian/.openclaw/workspace/shareazure/tests/results-$(date +%Y%m%d-%H%M%S).txt
echo "PASS: $PASS" >> /home/debian/.openclaw/workspace/shareazure/tests/results-$(date +%Y%m%d-%H%M%S).txt
echo "FAIL: $FAIL" >> /home/debian/.openclaw/workspace/shareazure/tests/results-$(date +%Y%m%d-%H%M%S).txt
echo "WARN: $WARN" >> /home/debian/.openclaw/workspace/shareazure/tests/results-$(date +%Y%m%d-%H%M%S).txt

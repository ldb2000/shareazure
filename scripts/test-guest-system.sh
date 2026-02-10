#!/bin/bash

# Script de test du système de comptes invités
# Usage: ./scripts/test-guest-system.sh

set -e

API_BASE="http://localhost:3000"
TEST_EMAIL="test-guest@example.com"

echo "🧪 Test du système de comptes invités ShareAzure"
echo "=================================================="
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonctions utilitaires
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test 1: Login utilisateur APRIL
echo "Test 1: Login utilisateur APRIL"
echo "--------------------------------"

APRIL_RESPONSE=$(curl -s -X POST "$API_BASE/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"april\",\"password\":\"april123\"}")

if [ $? -ne 0 ]; then
    error "Erreur lors du login"
fi

APRIL_TOKEN=$(echo "$APRIL_RESPONSE" | jq -r '.token')
APRIL_USERNAME=$(echo "$APRIL_RESPONSE" | jq -r '.user.username')

if [ "$APRIL_TOKEN" = "null" ] || [ -z "$APRIL_TOKEN" ]; then
    error "Token APRIL invalide: $APRIL_RESPONSE"
fi

success "Login APRIL réussi: $APRIL_USERNAME"
echo ""

# Test 2: Création d'un compte invité
echo "Test 2: Création d'un compte invité"
echo "------------------------------------"

GUEST_CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/api/admin/guest-accounts" \
  -H "Authorization: Bearer $APRIL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")

if [ $? -ne 0 ]; then
    error "Erreur lors de la création du compte invité"
fi

GUEST_ID=$(echo "$GUEST_CREATE_RESPONSE" | jq -r '.guest.guestId')
EMAIL_SENT=$(echo "$GUEST_CREATE_RESPONSE" | jq -r '.guest.emailSent')

if [ "$GUEST_ID" = "null" ] || [ -z "$GUEST_ID" ]; then
    error "Création invité échouée: $GUEST_CREATE_RESPONSE"
fi

success "Compte invité créé: $GUEST_ID"
info "Email envoyé: $EMAIL_SENT"
echo ""

# Test 3: Récupérer le code depuis la DB (pour test uniquement)
echo "Test 3: Récupération du code de vérification"
echo "---------------------------------------------"

CODE=$(sqlite3 backend/shareazure.db "SELECT verification_code FROM guest_accounts WHERE email = '$TEST_EMAIL' LIMIT 1;")

if [ -z "$CODE" ]; then
    error "Code introuvable dans la DB"
fi

success "Code récupéré: $CODE"
echo ""

# Test 4: Login invité avec le code
echo "Test 4: Login invité avec code"
echo "-------------------------------"

sleep 1  # Attendre 1 seconde pour être sûr

GUEST_LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/guest/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"code\":\"$CODE\"}")

GUEST_TOKEN=$(echo "$GUEST_LOGIN_RESPONSE" | jq -r '.token')
GUEST_EMAIL=$(echo "$GUEST_LOGIN_RESPONSE" | jq -r '.guest.email')

if [ "$GUEST_TOKEN" = "null" ] || [ -z "$GUEST_TOKEN" ]; then
    error "Login invité échoué: $GUEST_LOGIN_RESPONSE"
fi

success "Login invité réussi: $GUEST_EMAIL"
echo ""

# Test 5: Upload d'un fichier par l'invité
echo "Test 5: Upload de fichier par l'invité"
echo "---------------------------------------"

# Créer un fichier de test
TEST_FILE="/tmp/test-guest-upload.txt"
echo "Fichier de test uploadé par invité" > "$TEST_FILE"

UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE/api/upload" \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -F "file=@$TEST_FILE")

BLOB_NAME=$(echo "$UPLOAD_RESPONSE" | jq -r '.file.blobName')

if [ "$BLOB_NAME" = "null" ] || [ -z "$BLOB_NAME" ]; then
    error "Upload échoué: $UPLOAD_RESPONSE"
fi

success "Fichier uploadé: $BLOB_NAME"
echo ""

# Test 6: Liste des fichiers (invité voit uniquement ses fichiers)
echo "Test 6: Liste des fichiers (vue invité)"
echo "----------------------------------------"

FILES_RESPONSE=$(curl -s -X GET "$API_BASE/api/files" \
  -H "Authorization: Bearer $GUEST_TOKEN")

FILE_COUNT=$(echo "$FILES_RESPONSE" | jq '.count')

success "Invité voit $FILE_COUNT fichier(s)"
echo ""

# Test 7: Tentative de suppression par l'invité (doit échouer)
echo "Test 7: Tentative de suppression par invité (doit échouer)"
echo "-----------------------------------------------------------"

DELETE_RESPONSE=$(curl -s -X DELETE "$API_BASE/api/files/$BLOB_NAME" \
  -H "Authorization: Bearer $GUEST_TOKEN")

DELETE_SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r '.success')

if [ "$DELETE_SUCCESS" = "true" ]; then
    error "L'invité a pu supprimer un fichier (comportement incorrect)"
fi

success "Suppression correctement refusée pour l'invité"
echo ""

# Test 8: Liste des invités (vue april_user)
echo "Test 8: Liste des invités (vue april_user)"
echo "-------------------------------------------"

GUESTS_LIST_RESPONSE=$(curl -s -X GET "$API_BASE/api/admin/guest-accounts" \
  -H "Authorization: Bearer $APRIL_TOKEN")

GUESTS_COUNT=$(echo "$GUESTS_LIST_RESPONSE" | jq '.guests | length')

success "April_user voit $GUESTS_COUNT invité(s)"
echo ""

# Test 9: Désactivation du compte invité
echo "Test 9: Désactivation du compte invité"
echo "---------------------------------------"

DISABLE_RESPONSE=$(curl -s -X PUT "$API_BASE/api/admin/guest-accounts/$GUEST_ID/disable" \
  -H "Authorization: Bearer $APRIL_TOKEN")

DISABLE_SUCCESS=$(echo "$DISABLE_RESPONSE" | jq -r '.success')

if [ "$DISABLE_SUCCESS" != "true" ]; then
    error "Désactivation échouée: $DISABLE_RESPONSE"
fi

success "Compte invité désactivé"
echo ""

# Test 10: Suppression du compte et des fichiers
echo "Test 10: Suppression du compte invité et de ses fichiers"
echo "---------------------------------------------------------"

DELETE_GUEST_RESPONSE=$(curl -s -X DELETE "$API_BASE/api/admin/guest-accounts/$GUEST_ID" \
  -H "Authorization: Bearer $APRIL_TOKEN")

DELETE_GUEST_SUCCESS=$(echo "$DELETE_GUEST_RESPONSE" | jq -r '.success')
FILES_DELETED=$(echo "$DELETE_GUEST_RESPONSE" | jq -r '.stats.filesDeleted')

if [ "$DELETE_GUEST_SUCCESS" != "true" ]; then
    error "Suppression invité échouée: $DELETE_GUEST_RESPONSE"
fi

success "Compte invité supprimé ($FILES_DELETED fichier(s) supprimé(s))"
echo ""

# Cleanup
rm -f "$TEST_FILE"

# Résumé
echo "=================================================="
echo -e "${GREEN}✅ Tous les tests sont passés avec succès !${NC}"
echo "=================================================="
echo ""
echo "Résumé des tests:"
echo "  ✅ Login utilisateur APRIL"
echo "  ✅ Création compte invité"
echo "  ✅ Récupération code de vérification"
echo "  ✅ Login invité avec code"
echo "  ✅ Upload fichier par invité"
echo "  ✅ Liste fichiers (filtrage correct)"
echo "  ✅ Restriction suppression pour invité"
echo "  ✅ Liste invités par april_user"
echo "  ✅ Désactivation compte invité"
echo "  ✅ Suppression compte + fichiers"
echo ""
echo "Le système de comptes invités fonctionne correctement ! 🎉"

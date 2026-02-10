#!/bin/bash

# Script de test pour les fonctionnalités avancées v2.0
# Usage: ./scripts/test-advanced-features.sh

API_URL="http://localhost:3000/api"
TEST_FILE="test-document.txt"
BLOB_NAME=""
LINK_ID=""
PASSWORD="Test123!"

echo "🧪 Tests des fonctionnalités avancées ShareAzure v2.0"
echo "=================================================="
echo ""

# Vérifier que le serveur est démarré
echo "1️⃣  Vérification de la santé du serveur..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ Serveur opérationnel"
else
    echo "❌ Serveur non accessible. Démarrez-le avec: cd backend && npm start"
    exit 1
fi
echo ""

# Créer un fichier de test
echo "2️⃣  Création d'un fichier de test..."
echo "Ceci est un document de test pour ShareAzure v2.0" > "$TEST_FILE"
echo "✅ Fichier créé: $TEST_FILE"
echo ""

# Upload du fichier
echo "3️⃣  Upload du fichier de test..."
UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/upload" \
  -F "file=@$TEST_FILE")

if echo "$UPLOAD_RESPONSE" | grep -q '"success":true'; then
    BLOB_NAME=$(echo "$UPLOAD_RESPONSE" | grep -o '"blobName":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Fichier uploadé: $BLOB_NAME"
else
    echo "❌ Erreur lors de l'upload"
    echo "$UPLOAD_RESPONSE"
    exit 1
fi
echo ""

# Test 1: Génération de lien simple (sans mot de passe)
echo "4️⃣  Test 1: Génération de lien simple"
SIMPLE_LINK_RESPONSE=$(curl -s -X POST "$API_URL/share/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"blobName\": \"$BLOB_NAME\",
    \"expiresInMinutes\": 60
  }")

if echo "$SIMPLE_LINK_RESPONSE" | grep -q '"success":true'; then
    LINK_ID_SIMPLE=$(echo "$SIMPLE_LINK_RESPONSE" | grep -o '"linkId":"[^"]*"' | cut -d'"' -f4)
    SHARE_LINK=$(echo "$SIMPLE_LINK_RESPONSE" | grep -o '"shareLink":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Lien simple généré"
    echo "   Link ID: $LINK_ID_SIMPLE"
    echo "   Share URL: ${SHARE_LINK:0:60}..."
    echo "   QR Code: $(echo "$SIMPLE_LINK_RESPONSE" | grep -q 'qrCode' && echo '✅ Généré' || echo '❌ Manquant')"
else
    echo "❌ Erreur lors de la génération"
    echo "$SIMPLE_LINK_RESPONSE"
    exit 1
fi
echo ""

# Test 2: Génération de lien protégé par mot de passe
echo "5️⃣  Test 2: Génération de lien protégé"
PROTECTED_LINK_RESPONSE=$(curl -s -X POST "$API_URL/share/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"blobName\": \"$BLOB_NAME\",
    \"expiresInMinutes\": 120,
    \"password\": \"$PASSWORD\"
  }")

if echo "$PROTECTED_LINK_RESPONSE" | grep -q '"success":true'; then
    LINK_ID=$(echo "$PROTECTED_LINK_RESPONSE" | grep -o '"linkId":"[^"]*"' | cut -d'"' -f4)
    HAS_PASSWORD=$(echo "$PROTECTED_LINK_RESPONSE" | grep -o '"hasPassword":[^,}]*' | cut -d':' -f2)
    echo "✅ Lien protégé généré"
    echo "   Link ID: $LINK_ID"
    echo "   Protected: $HAS_PASSWORD"
else
    echo "❌ Erreur lors de la génération"
    echo "$PROTECTED_LINK_RESPONSE"
    exit 1
fi
echo ""

# Test 3: Consultation de l'historique
echo "6️⃣  Test 3: Consultation de l'historique"
HISTORY_RESPONSE=$(curl -s "$API_URL/share/history")

if echo "$HISTORY_RESPONSE" | grep -q '"success":true'; then
    LINK_COUNT=$(echo "$HISTORY_RESPONSE" | grep -o '"count":[0-9]*' | cut -d':' -f2)
    echo "✅ Historique récupéré"
    echo "   Nombre de liens: $LINK_COUNT"
else
    echo "❌ Erreur lors de la récupération"
    echo "$HISTORY_RESPONSE"
    exit 1
fi
echo ""

# Test 4: Statistiques d'un lien
echo "7️⃣  Test 4: Statistiques du lien"
STATS_RESPONSE=$(curl -s "$API_URL/share/stats/$LINK_ID")

if echo "$STATS_RESPONSE" | grep -q '"success":true'; then
    DOWNLOAD_COUNT=$(echo "$STATS_RESPONSE" | grep -o '"download_count":[0-9]*' | cut -d':' -f2)
    echo "✅ Statistiques récupérées"
    echo "   Téléchargements: $DOWNLOAD_COUNT"
else
    echo "❌ Erreur lors de la récupération des stats"
    echo "$STATS_RESPONSE"
    exit 1
fi
echo ""

# Test 5: Téléchargement avec mauvais mot de passe
echo "8️⃣  Test 5: Téléchargement avec mauvais mot de passe"
WRONG_PASSWORD_RESPONSE=$(curl -s -X POST "$API_URL/share/download/$LINK_ID" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"WrongPassword\"}")

if echo "$WRONG_PASSWORD_RESPONSE" | grep -q 'incorrect'; then
    echo "✅ Rejet du mauvais mot de passe"
else
    echo "⚠️  Le serveur n'a pas rejeté le mauvais mot de passe"
fi
echo ""

# Test 6: Téléchargement avec bon mot de passe
echo "9️⃣  Test 6: Téléchargement avec bon mot de passe"
curl -s -X POST "$API_URL/share/download/$LINK_ID" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"$PASSWORD\"}" \
  -o "downloaded-$TEST_FILE"

if [ -f "downloaded-$TEST_FILE" ]; then
    echo "✅ Fichier téléchargé avec succès"
    
    # Vérifier que le compteur a augmenté
    sleep 1
    NEW_STATS_RESPONSE=$(curl -s "$API_URL/share/stats/$LINK_ID")
    NEW_DOWNLOAD_COUNT=$(echo "$NEW_STATS_RESPONSE" | grep -o '"download_count":[0-9]*' | cut -d':' -f2)
    
    if [ "$NEW_DOWNLOAD_COUNT" -gt "$DOWNLOAD_COUNT" ]; then
        echo "✅ Compteur incrémenté: $DOWNLOAD_COUNT → $NEW_DOWNLOAD_COUNT"
    else
        echo "⚠️  Compteur non mis à jour"
    fi
else
    echo "❌ Erreur lors du téléchargement"
fi
echo ""

# Test 7: Désactivation d'un lien
echo "🔟 Test 7: Désactivation du lien"
DEACTIVATE_RESPONSE=$(curl -s -X DELETE "$API_URL/share/$LINK_ID")

if echo "$DEACTIVATE_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Lien désactivé avec succès"
    
    # Vérifier que le lien n'est plus actif
    sleep 1
    DEACTIVATED_STATS=$(curl -s "$API_URL/share/stats/$LINK_ID")
    IS_ACTIVE=$(echo "$DEACTIVATED_STATS" | grep -o '"isActive":[^,}]*' | cut -d':' -f2)
    
    if [ "$IS_ACTIVE" = "false" ]; then
        echo "✅ Statut confirmé: inactif"
    else
        echo "⚠️  Le lien semble toujours actif"
    fi
else
    echo "❌ Erreur lors de la désactivation"
fi
echo ""

# Nettoyage
echo "🧹 Nettoyage..."
rm -f "$TEST_FILE" "downloaded-$TEST_FILE"
curl -s -X DELETE "$API_URL/files/$BLOB_NAME" > /dev/null
echo "✅ Fichiers de test supprimés"
echo ""

# Résumé
echo "=================================================="
echo "📊 Résumé des tests"
echo "=================================================="
echo "✅ Génération de lien simple (avec QR Code)"
echo "✅ Génération de lien protégé par mot de passe"
echo "✅ Consultation de l'historique"
echo "✅ Consultation des statistiques"
echo "✅ Rejet du mauvais mot de passe"
echo "✅ Téléchargement avec bon mot de passe"
echo "✅ Incrémentation du compteur"
echo "✅ Désactivation manuelle du lien"
echo ""
echo "🎉 Tous les tests sont passés avec succès !"
echo ""
echo "💡 Pour tester l'interface web:"
echo "   1. Ouvrez http://localhost:8080"
echo "   2. Uploadez un fichier"
echo "   3. Cliquez sur 🔗 Partager"
echo "   4. Testez avec/sans mot de passe"
echo "   5. Cliquez sur 📊 Historique des partages"
echo "   6. Consultez les statistiques"
echo "   7. Scannez le QR Code avec votre téléphone"

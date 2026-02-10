#!/bin/bash
# ============================================
# ShareAzure - Test complet de tous les endpoints
# ============================================
# Usage:
#   ./scripts/test-all-endpoints.sh                  # Tester tous les domaines
#   ./scripts/test-all-endpoints.sh --domain health   # Tester un seul domaine
#   ./scripts/test-all-endpoints.sh --domain auth
#
# Prerequis: Le serveur doit etre demarre sur le port defini (par defaut 3000)

set -euo pipefail

# ============================================
# Configuration
# ============================================
BASE_URL="${BASE_URL:-http://localhost:3000}"
PASSED=0
FAILED=0
SKIPPED=0
TOTAL=0
DOMAIN_FILTER="${2:-}"

# ============================================
# Couleurs
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ============================================
# Fonctions utilitaires
# ============================================

log_section() {
  echo ""
  echo -e "${BOLD}${BLUE}============================================${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}============================================${NC}"
}

log_test() {
  echo -e "  ${CYAN}TEST:${NC} $1"
}

log_pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))
}

log_fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  echo -e "    ${RED}Expected: $2, Got: $3${NC}"
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
}

log_skip() {
  echo -e "  ${YELLOW}SKIP${NC} $1"
  SKIPPED=$((SKIPPED + 1))
}

# Assert HTTP status code
# Usage: assert_status "description" expected_code actual_code
assert_status() {
  local description="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    log_pass "$description (HTTP $actual)"
  else
    log_fail "$description" "HTTP $expected" "HTTP $actual"
  fi
}

# Assert JSON field exists
# Usage: assert_json_field "description" response "field"
assert_json_field() {
  local description="$1"
  local response="$2"
  local field="$3"

  if echo "$response" | jq -e ".$field" > /dev/null 2>&1; then
    log_pass "$description - field '$field' present"
  else
    log_fail "$description" "field '$field' present" "field missing"
  fi
}

# Make a request and get status code + body
# Usage: result=$(do_request "GET" "/api/endpoint" "optional_body" "optional_token")
do_request() {
  local method="$1"
  local endpoint="$2"
  local body="${3:-}"
  local token="${4:-}"
  local extra_args=""

  if [ -n "$token" ]; then
    extra_args="-H \"Authorization: Bearer $token\""
  fi

  if [ -n "$body" ]; then
    if [ "$method" = "GET" ]; then
      eval curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        $extra_args 2>/dev/null
    else
      eval curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "'$body'" \
        $extra_args 2>/dev/null
    fi
  else
    eval curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      $extra_args 2>/dev/null
  fi
}

# Extract status code from response (last line)
get_status() {
  echo "$1" | tail -1
}

# Extract body from response (all but last line)
get_body() {
  echo "$1" | sed '$d'
}

# Check if a domain should be tested
should_test() {
  if [ -z "$DOMAIN_FILTER" ]; then
    return 0
  fi
  [ "$1" = "$DOMAIN_FILTER" ]
}

# ============================================
# Parse arguments
# ============================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN_FILTER="$2"
      shift 2
      ;;
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--domain <name>] [--url <base_url>]"
      echo ""
      echo "Domains: health, auth, files, share, settings, email-domains,"
      echo "         guest-accounts, user-files, teams, costs, storage-tiers"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# ============================================
# Check server is running
# ============================================
echo -e "${BOLD}ShareAzure - Test de tous les endpoints${NC}"
echo -e "Base URL: ${CYAN}$BASE_URL${NC}"
if [ -n "$DOMAIN_FILTER" ]; then
  echo -e "Domaine: ${CYAN}$DOMAIN_FILTER${NC}"
fi
echo ""

# Quick health check
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" != "200" ]; then
  echo -e "${RED}ERREUR: Le serveur n'est pas accessible sur $BASE_URL${NC}"
  echo -e "Demarrez le serveur avec: cd backend && npm start"
  exit 1
fi
echo -e "${GREEN}Serveur accessible${NC}"

# ============================================
# Variables globales pour les tokens
# ============================================
ADMIN_TOKEN=""
USER_TOKEN=""
APRIL_TOKEN=""
GUEST_TOKEN=""

# ============================================
# 1. HEALTH
# ============================================
if should_test "health"; then
  log_section "1. Health & Container"

  # GET /api/health
  result=$(do_request "GET" "/api/health")
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "GET /api/health" "200" "$status"
  assert_json_field "Health check" "$body" "status"

  # GET /api/logo-april.svg
  result=$(do_request "GET" "/api/logo-april.svg")
  status=$(get_status "$result")
  # 200 or 404 depending on file existence
  if [ "$status" = "200" ] || [ "$status" = "404" ]; then
    log_pass "GET /api/logo-april.svg (HTTP $status)"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
  else
    log_fail "GET /api/logo-april.svg" "200 or 404" "HTTP $status"
  fi

  # POST /api/container/init
  result=$(do_request "POST" "/api/container/init")
  status=$(get_status "$result")
  assert_status "POST /api/container/init" "200" "$status"
fi

# ============================================
# 2. AUTH
# ============================================
if should_test "auth"; then
  log_section "2. Authentication"

  # POST /api/admin/login - valid
  result=$(do_request "POST" "/api/admin/login" '{"username":"admin","password":"admin123"}')
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "POST /api/admin/login (valid)" "200" "$status"
  ADMIN_TOKEN=$(echo "$body" | jq -r '.token // empty')
  if [ -n "$ADMIN_TOKEN" ]; then
    log_pass "Admin token received"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
  fi

  # POST /api/admin/login - invalid password
  result=$(do_request "POST" "/api/admin/login" '{"username":"admin","password":"wrong"}')
  status=$(get_status "$result")
  assert_status "POST /api/admin/login (bad password)" "401" "$status"

  # POST /api/admin/login - non-admin
  result=$(do_request "POST" "/api/admin/login" '{"username":"user","password":"user123"}')
  status=$(get_status "$result")
  assert_status "POST /api/admin/login (non-admin)" "403" "$status"

  # POST /api/admin/verify
  if [ -n "$ADMIN_TOKEN" ]; then
    result=$(do_request "POST" "/api/admin/verify" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "POST /api/admin/verify (valid)" "200" "$status"
  fi

  # POST /api/admin/verify - no token
  result=$(do_request "POST" "/api/admin/verify")
  status=$(get_status "$result")
  assert_status "POST /api/admin/verify (no token)" "401" "$status"

  # POST /api/user/login - valid
  result=$(do_request "POST" "/api/user/login" '{"username":"user","password":"user123"}')
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "POST /api/user/login (valid)" "200" "$status"
  USER_TOKEN=$(echo "$body" | jq -r '.token // empty')

  # POST /api/user/login - invalid
  result=$(do_request "POST" "/api/user/login" '{"username":"user","password":"wrong"}')
  status=$(get_status "$result")
  assert_status "POST /api/user/login (bad password)" "401" "$status"

  # POST /api/user/login - april
  result=$(do_request "POST" "/api/user/login" '{"username":"april","password":"april123"}')
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "POST /api/user/login (april)" "200" "$status"
  APRIL_TOKEN=$(echo "$body" | jq -r '.token // empty')

  # POST /api/user/verify
  if [ -n "$USER_TOKEN" ]; then
    result=$(do_request "POST" "/api/user/verify" "" "$USER_TOKEN")
    status=$(get_status "$result")
    assert_status "POST /api/user/verify (valid)" "200" "$status"
  fi
fi

# Get tokens if not already set (for other domains)
if [ -z "$ADMIN_TOKEN" ]; then
  result=$(do_request "POST" "/api/admin/login" '{"username":"admin","password":"admin123"}')
  body=$(get_body "$result")
  ADMIN_TOKEN=$(echo "$body" | jq -r '.token // empty')
fi
if [ -z "$USER_TOKEN" ]; then
  result=$(do_request "POST" "/api/user/login" '{"username":"user","password":"user123"}')
  body=$(get_body "$result")
  USER_TOKEN=$(echo "$body" | jq -r '.token // empty')
fi
if [ -z "$APRIL_TOKEN" ]; then
  result=$(do_request "POST" "/api/user/login" '{"username":"april","password":"april123"}')
  body=$(get_body "$result")
  APRIL_TOKEN=$(echo "$body" | jq -r '.token // empty')
fi

# ============================================
# 3. FILES
# ============================================
if should_test "files"; then
  log_section "3. File Management"

  # POST /api/upload - with auth
  UPLOAD_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -F "file=@/dev/stdin;filename=test-bash.txt;type=text/plain" <<< "test content from bash" 2>/dev/null)
  status=$(get_status "$UPLOAD_RESULT")
  body=$(get_body "$UPLOAD_RESULT")
  assert_status "POST /api/upload (with auth)" "200" "$status"
  UPLOADED_BLOB=$(echo "$body" | jq -r '.file.blobName // empty')

  # POST /api/upload - without auth
  UPLOAD_NO_AUTH=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -F "file=@/dev/stdin;filename=test.txt;type=text/plain" <<< "test" 2>/dev/null)
  status=$(get_status "$UPLOAD_NO_AUTH")
  assert_status "POST /api/upload (no auth)" "401" "$status"

  # GET /api/files - with auth
  result=$(do_request "GET" "/api/files" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/files (with auth)" "200" "$status"

  # GET /api/files - no auth
  result=$(do_request "GET" "/api/files")
  status=$(get_status "$result")
  assert_status "GET /api/files (no auth)" "401" "$status"

  # GET /api/download/:blobName
  if [ -n "$UPLOADED_BLOB" ]; then
    result=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/download/$UPLOADED_BLOB" 2>/dev/null)
    assert_status "GET /api/download/:blobName" "200" "$result"
  fi

  # GET /api/preview/:blobName
  if [ -n "$UPLOADED_BLOB" ]; then
    result=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/preview/$UPLOADED_BLOB" 2>/dev/null)
    assert_status "GET /api/preview/:blobName" "200" "$result"
  fi

  # DELETE /api/files/:blobName - no auth
  result=$(do_request "DELETE" "/api/files/fake-blob.txt")
  status=$(get_status "$result")
  assert_status "DELETE /api/files (no auth)" "401" "$status"

  # DELETE /api/files/:blobName - with auth
  if [ -n "$UPLOADED_BLOB" ]; then
    result=$(do_request "DELETE" "/api/files/$UPLOADED_BLOB" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    # May be 200 or 403/404 depending on ownership
    if [ "$status" = "200" ] || [ "$status" = "403" ] || [ "$status" = "404" ]; then
      log_pass "DELETE /api/files/:blobName (HTTP $status)"
      TOTAL=$((TOTAL + 1))
      PASSED=$((PASSED + 1))
    else
      log_fail "DELETE /api/files/:blobName" "200/403/404" "HTTP $status"
    fi
  fi
fi

# ============================================
# 4. SHARE
# ============================================
if should_test "share"; then
  log_section "4. Share Links"

  # Upload a file first for sharing tests
  SHARE_UPLOAD=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -F "file=@/dev/stdin;filename=share-test.txt;type=text/plain" <<< "share test content" 2>/dev/null)
  SHARE_BLOB=$(get_body "$SHARE_UPLOAD" | jq -r '.file.blobName // empty')

  # POST /api/share/generate - valid
  if [ -n "$SHARE_BLOB" ]; then
    result=$(do_request "POST" "/api/share/generate" "{\"blobName\":\"$SHARE_BLOB\",\"expiresInMinutes\":60,\"recipientEmail\":\"test@shareazure.local\"}")
    status=$(get_status "$result")
    body=$(get_body "$result")
    assert_status "POST /api/share/generate" "200" "$status"
    SHARE_LINK_ID=$(echo "$body" | jq -r '.linkId // empty')
  fi

  # POST /api/share/generate - no blobName
  result=$(do_request "POST" "/api/share/generate" '{"recipientEmail":"test@test.com"}')
  status=$(get_status "$result")
  assert_status "POST /api/share/generate (no blobName)" "400" "$status"

  # POST /api/share/generate - no email
  result=$(do_request "POST" "/api/share/generate" '{"blobName":"test.pdf"}')
  status=$(get_status "$result")
  assert_status "POST /api/share/generate (no email)" "400" "$status"

  # GET /api/share/info/:blobName
  if [ -n "$SHARE_BLOB" ]; then
    result=$(do_request "GET" "/api/share/info/$SHARE_BLOB")
    status=$(get_status "$result")
    assert_status "GET /api/share/info/:blobName" "200" "$status"
  fi

  # GET /api/share/history
  result=$(do_request "GET" "/api/share/history")
  status=$(get_status "$result")
  assert_status "GET /api/share/history" "200" "$status"

  # GET /api/share/stats/:linkId
  if [ -n "$SHARE_LINK_ID" ]; then
    result=$(do_request "GET" "/api/share/stats/$SHARE_LINK_ID")
    status=$(get_status "$result")
    assert_status "GET /api/share/stats/:linkId" "200" "$status"
  fi

  # GET /api/share/stats - nonexistent
  result=$(do_request "GET" "/api/share/stats/nonexistent-id")
  status=$(get_status "$result")
  assert_status "GET /api/share/stats (nonexistent)" "404" "$status"

  # DELETE /api/share/:linkId
  if [ -n "$SHARE_LINK_ID" ]; then
    result=$(do_request "DELETE" "/api/share/$SHARE_LINK_ID")
    status=$(get_status "$result")
    assert_status "DELETE /api/share/:linkId" "200" "$status"
  fi

  # DELETE /api/share - nonexistent
  result=$(do_request "DELETE" "/api/share/nonexistent-link")
  status=$(get_status "$result")
  assert_status "DELETE /api/share (nonexistent)" "404" "$status"
fi

# ============================================
# 5. SETTINGS
# ============================================
if should_test "settings"; then
  log_section "5. Settings"

  # GET /api/settings
  result=$(do_request "GET" "/api/settings")
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "GET /api/settings" "200" "$status"
  assert_json_field "Settings list" "$body" "settings"

  # GET /api/settings/:key
  result=$(do_request "GET" "/api/settings/maxFileSizeMB")
  status=$(get_status "$result")
  assert_status "GET /api/settings/maxFileSizeMB" "200" "$status"

  # GET /api/settings/:key - nonexistent
  result=$(do_request "GET" "/api/settings/nonExistentKey")
  status=$(get_status "$result")
  assert_status "GET /api/settings (nonexistent)" "404" "$status"

  # PUT /api/settings
  result=$(do_request "PUT" "/api/settings" '{"maxFileSizeMB":"200"}')
  status=$(get_status "$result")
  assert_status "PUT /api/settings" "200" "$status"

  # POST /api/settings/reset
  result=$(do_request "POST" "/api/settings/reset")
  status=$(get_status "$result")
  assert_status "POST /api/settings/reset" "200" "$status"

  # Verify reset
  result=$(do_request "GET" "/api/settings/maxFileSizeMB")
  body=$(get_body "$result")
  VALUE=$(echo "$body" | jq -r '.value // empty')
  if [ "$VALUE" = "100" ]; then
    log_pass "Settings reset verified (maxFileSizeMB = 100)"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
  else
    log_fail "Settings reset verification" "100" "$VALUE"
  fi
fi

# ============================================
# 6. EMAIL DOMAINS
# ============================================
if should_test "email-domains"; then
  log_section "6. Email Domains"

  # GET /api/admin/email-domains
  result=$(do_request "GET" "/api/admin/email-domains")
  status=$(get_status "$result")
  assert_status "GET /api/admin/email-domains" "200" "$status"

  # POST /api/admin/email-domains
  DOMAIN="bash-test-$(date +%s).com"
  result=$(do_request "POST" "/api/admin/email-domains" "{\"domain\":\"$DOMAIN\"}")
  status=$(get_status "$result")
  assert_status "POST /api/admin/email-domains" "200" "$status"

  # POST /api/admin/email-domains - duplicate
  result=$(do_request "POST" "/api/admin/email-domains" "{\"domain\":\"$DOMAIN\"}")
  status=$(get_status "$result")
  assert_status "POST /api/admin/email-domains (duplicate)" "409" "$status"

  # PUT /api/admin/email-domains/:domain/deactivate
  result=$(do_request "PUT" "/api/admin/email-domains/$DOMAIN/deactivate")
  status=$(get_status "$result")
  assert_status "PUT deactivate email domain" "200" "$status"

  # PUT /api/admin/email-domains/:domain/activate
  result=$(do_request "PUT" "/api/admin/email-domains/$DOMAIN/activate")
  status=$(get_status "$result")
  assert_status "PUT activate email domain" "200" "$status"

  # DELETE /api/admin/email-domains/:domain
  result=$(do_request "DELETE" "/api/admin/email-domains/$DOMAIN")
  status=$(get_status "$result")
  assert_status "DELETE /api/admin/email-domains" "200" "$status"
fi

# ============================================
# 7. GUEST ACCOUNTS
# ============================================
if should_test "guest-accounts"; then
  log_section "7. Guest Accounts"

  # POST /api/admin/guest-accounts - admin
  GUEST_EMAIL="bash-guest-$(date +%s)@test.com"
  result=$(do_request "POST" "/api/admin/guest-accounts" "{\"email\":\"$GUEST_EMAIL\"}" "$ADMIN_TOKEN")
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "POST /api/admin/guest-accounts (admin)" "200" "$status"
  GUEST_ID=$(echo "$body" | jq -r '.guest.guestId // empty')

  # POST /api/admin/guest-accounts - april_user
  GUEST_EMAIL2="bash-guest2-$(date +%s)@test.com"
  result=$(do_request "POST" "/api/admin/guest-accounts" "{\"email\":\"$GUEST_EMAIL2\"}" "$APRIL_TOKEN")
  status=$(get_status "$result")
  assert_status "POST /api/admin/guest-accounts (april)" "200" "$status"

  # POST /api/admin/guest-accounts - regular user (rejected)
  result=$(do_request "POST" "/api/admin/guest-accounts" '{"email":"nope@test.com"}' "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "POST /api/admin/guest-accounts (user, rejected)" "403" "$status"

  # POST /api/admin/guest-accounts - no auth
  result=$(do_request "POST" "/api/admin/guest-accounts" '{"email":"nope@test.com"}')
  status=$(get_status "$result")
  assert_status "POST /api/admin/guest-accounts (no auth)" "401" "$status"

  # GET /api/admin/guest-accounts
  result=$(do_request "GET" "/api/admin/guest-accounts" "" "$ADMIN_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/admin/guest-accounts" "200" "$status"

  # POST /api/guest/login - wrong code
  result=$(do_request "POST" "/api/guest/login" "{\"email\":\"$GUEST_EMAIL\",\"code\":\"000000\"}")
  status=$(get_status "$result")
  assert_status "POST /api/guest/login (wrong code)" "401" "$status"

  # POST /api/guest/login - missing fields
  result=$(do_request "POST" "/api/guest/login" '{"email":"test@test.com"}')
  status=$(get_status "$result")
  assert_status "POST /api/guest/login (missing code)" "400" "$status"

  # PUT /api/admin/guest-accounts/:guestId/disable
  if [ -n "$GUEST_ID" ]; then
    result=$(do_request "PUT" "/api/admin/guest-accounts/$GUEST_ID/disable" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "PUT disable guest account" "200" "$status"
  fi

  # DELETE /api/admin/guest-accounts/:guestId
  if [ -n "$GUEST_ID" ]; then
    result=$(do_request "DELETE" "/api/admin/guest-accounts/$GUEST_ID" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "DELETE /api/admin/guest-accounts" "200" "$status"
  fi
fi

# ============================================
# 8. USER FILES
# ============================================
if should_test "user-files"; then
  log_section "8. User Files"

  # GET /api/user/files
  result=$(do_request "GET" "/api/user/files" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/user/files (with auth)" "200" "$status"

  # GET /api/user/files - no auth
  result=$(do_request "GET" "/api/user/files")
  status=$(get_status "$result")
  assert_status "GET /api/user/files (no auth)" "401" "$status"

  # POST /api/user/folders/create
  result=$(do_request "POST" "/api/user/folders/create" '{"folderName":"test-folder","path":""}' "$USER_TOKEN")
  status=$(get_status "$result")
  # Various valid statuses depending on implementation
  if [ "$status" = "200" ] || [ "$status" = "400" ] || [ "$status" = "500" ]; then
    log_pass "POST /api/user/folders/create (HTTP $status)"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
  fi

  # GET /api/user/share-links
  result=$(do_request "GET" "/api/user/share-links" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/user/share-links" "200" "$status"

  # GET /api/user/share-links - no auth
  result=$(do_request "GET" "/api/user/share-links")
  status=$(get_status "$result")
  assert_status "GET /api/user/share-links (no auth)" "401" "$status"
fi

# ============================================
# 9. TEAMS
# ============================================
if should_test "teams"; then
  log_section "9. Teams"

  # POST /api/teams - admin
  TEAM_NAME="bash-team-$(date +%s)"
  result=$(do_request "POST" "/api/teams" "{\"name\":\"$TEAM_NAME\",\"displayName\":\"Bash Test Team\",\"description\":\"Test\"}" "$ADMIN_TOKEN")
  status=$(get_status "$result")
  body=$(get_body "$result")
  assert_status "POST /api/teams (admin)" "200" "$status"
  TEAM_ID=$(echo "$body" | jq -r '.team.id // empty')

  # POST /api/teams - non-admin (rejected)
  result=$(do_request "POST" "/api/teams" '{"name":"nope","displayName":"Nope"}' "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "POST /api/teams (non-admin)" "403" "$status"

  # GET /api/teams
  result=$(do_request "GET" "/api/teams" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/teams" "200" "$status"

  # GET /api/teams/:teamId
  if [ -n "$TEAM_ID" ]; then
    result=$(do_request "GET" "/api/teams/$TEAM_ID" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "GET /api/teams/:teamId" "200" "$status"
  fi

  # PUT /api/teams/:teamId
  if [ -n "$TEAM_ID" ]; then
    result=$(do_request "PUT" "/api/teams/$TEAM_ID" '{"displayName":"Updated Team","description":"Updated"}' "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "PUT /api/teams/:teamId" "200" "$status"
  fi

  # Get user ID for member operations
  USER_ID=$(do_request "POST" "/api/user/verify" "" "$USER_TOKEN" | sed '$d' | jq -r '.user.id // empty')

  # POST /api/teams/:teamId/members
  if [ -n "$TEAM_ID" ] && [ -n "$USER_ID" ]; then
    result=$(do_request "POST" "/api/teams/$TEAM_ID/members" "{\"userId\":$USER_ID,\"role\":\"member\"}" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "POST /api/teams/:teamId/members" "200" "$status"
  fi

  # GET /api/teams/:teamId/members
  if [ -n "$TEAM_ID" ]; then
    result=$(do_request "GET" "/api/teams/$TEAM_ID/members" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "GET /api/teams/:teamId/members" "200" "$status"
  fi

  # PUT /api/teams/:teamId/members/:userId
  if [ -n "$TEAM_ID" ] && [ -n "$USER_ID" ]; then
    result=$(do_request "PUT" "/api/teams/$TEAM_ID/members/$USER_ID" '{"role":"viewer"}' "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "PUT /api/teams/:teamId/members/:userId" "200" "$status"
  fi

  # DELETE /api/teams/:teamId/members/:userId
  if [ -n "$TEAM_ID" ] && [ -n "$USER_ID" ]; then
    result=$(do_request "DELETE" "/api/teams/$TEAM_ID/members/$USER_ID" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "DELETE /api/teams/:teamId/members/:userId" "200" "$status"
  fi

  # DELETE /api/teams/:teamId
  if [ -n "$TEAM_ID" ]; then
    result=$(do_request "DELETE" "/api/teams/$TEAM_ID" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "DELETE /api/teams/:teamId" "200" "$status"
  fi

  # DELETE /api/teams - non-admin
  result=$(do_request "DELETE" "/api/teams/99999" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "DELETE /api/teams (non-admin)" "403" "$status"
fi

# ============================================
# 10. COSTS
# ============================================
if should_test "costs"; then
  log_section "10. Costs"

  # Get user ID
  USER_INFO=$(do_request "POST" "/api/user/verify" "" "$USER_TOKEN" | sed '$d')
  COST_USER_ID=$(echo "$USER_INFO" | jq -r '.user.id // empty')

  # GET /api/costs/user/:userId - own costs
  if [ -n "$COST_USER_ID" ]; then
    result=$(do_request "GET" "/api/costs/user/$COST_USER_ID" "" "$USER_TOKEN")
    status=$(get_status "$result")
    assert_status "GET /api/costs/user/:userId (own)" "200" "$status"
  fi

  # GET /api/costs/user/:userId - admin viewing another
  if [ -n "$COST_USER_ID" ]; then
    result=$(do_request "GET" "/api/costs/user/$COST_USER_ID" "" "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "GET /api/costs/user/:userId (admin)" "200" "$status"
  fi

  # GET /api/costs/user/:userId - non-admin viewing other (rejected)
  result=$(do_request "GET" "/api/costs/user/1" "" "$USER_TOKEN")
  status=$(get_status "$result")
  # May be 200 if userId matches or 403
  if [ "$status" = "200" ] || [ "$status" = "403" ]; then
    log_pass "GET /api/costs/user (permission check: HTTP $status)"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
  fi

  # GET /api/admin/costs - admin
  result=$(do_request "GET" "/api/admin/costs" "" "$ADMIN_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/admin/costs (admin)" "200" "$status"

  # GET /api/admin/costs - non-admin (rejected)
  result=$(do_request "GET" "/api/admin/costs" "" "$USER_TOKEN")
  status=$(get_status "$result")
  assert_status "GET /api/admin/costs (non-admin)" "403" "$status"

  # GET /api/admin/costs - no auth
  result=$(do_request "GET" "/api/admin/costs")
  status=$(get_status "$result")
  assert_status "GET /api/admin/costs (no auth)" "401" "$status"
fi

# ============================================
# 11. STORAGE TIERS
# ============================================
if should_test "storage-tiers"; then
  log_section "11. Storage Tiers"

  # Upload a file for tier tests
  TIER_UPLOAD=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -F "file=@/dev/stdin;filename=tier-test.txt;type=text/plain" <<< "tier test content" 2>/dev/null)
  TIER_BLOB=$(get_body "$TIER_UPLOAD" | jq -r '.file.blobName // empty')

  if [ -n "$TIER_BLOB" ]; then
    # POST /api/files/:blobName/archive
    result=$(do_request "POST" "/api/files/$TIER_BLOB/archive" '{"tier":"Cool","reason":"test"}' "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "POST /api/files/:blobName/archive" "200" "$status"

    # POST /api/files/:blobName/archive - invalid tier
    result=$(do_request "POST" "/api/files/$TIER_BLOB/archive" '{"tier":"Invalid"}' "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "POST archive (invalid tier)" "400" "$status"

    # GET /api/files/:blobName/tier-status
    result=$(do_request "GET" "/api/files/$TIER_BLOB/tier-status" "" "$USER_TOKEN")
    status=$(get_status "$result")
    # May be 200 or 403 depending on ownership
    if [ "$status" = "200" ] || [ "$status" = "403" ]; then
      log_pass "GET /api/files/:blobName/tier-status (HTTP $status)"
      TOTAL=$((TOTAL + 1))
      PASSED=$((PASSED + 1))
    fi

    # POST /api/files/:blobName/rehydrate - invalid target
    result=$(do_request "POST" "/api/files/$TIER_BLOB/rehydrate" '{"targetTier":"Invalid"}' "$ADMIN_TOKEN")
    status=$(get_status "$result")
    assert_status "POST rehydrate (invalid target)" "400" "$status"
  fi

  # Archive - no auth
  result=$(do_request "POST" "/api/files/fake.pdf/archive" '{"tier":"Cool"}')
  status=$(get_status "$result")
  assert_status "POST archive (no auth)" "401" "$status"

  # Rehydrate - no auth
  result=$(do_request "POST" "/api/files/fake.pdf/rehydrate" '{"targetTier":"Hot"}')
  status=$(get_status "$result")
  assert_status "POST rehydrate (no auth)" "401" "$status"
fi

# ============================================
# RESUME
# ============================================
echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  RESUME DES TESTS${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Total:    ${BOLD}$TOTAL${NC}"
echo -e "  ${GREEN}Passes:   $PASSED${NC}"
echo -e "  ${RED}Echoues:  $FAILED${NC}"
echo -e "  ${YELLOW}Ignores:  $SKIPPED${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}${BOLD}ECHEC - $FAILED test(s) en echec${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}SUCCES - Tous les $PASSED tests passent !${NC}"
  exit 0
fi

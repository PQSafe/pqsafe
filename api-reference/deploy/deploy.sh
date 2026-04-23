#!/usr/bin/env bash
# PQSafe REST API — Fly.io Deploy Script
# Run once to deploy api.pqsafe.xyz on Fly.io (Singapore region).
#
# Prerequisites:
#   - flyctl installed:  brew install flyctl
#   - Logged in:        fly auth login
#   - Airwallex prod credentials ready (from Airwallex dashboard)
#
# Usage:
#   bash deploy/deploy.sh
#
# For subsequent re-deploys (code changes only):
#   fly deploy --app pqsafe-api --config deploy/fly.toml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_NAME="pqsafe-api"
APP_REGION="sin"   # Singapore — closest to HK / APAC

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}   $*"; }
error()   { echo -e "${RED}[error]${NC}  $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Preflight checks
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v flyctl &>/dev/null && ! command -v fly &>/dev/null; then
  error "flyctl not found. Install: brew install flyctl"
fi

FLY="flyctl"
command -v flyctl &>/dev/null || FLY="fly"

if ! $FLY auth whoami &>/dev/null; then
  error "Not logged in to Fly.io. Run: $FLY auth login"
fi

CURRENT_USER=$($FLY auth whoami 2>/dev/null)
info "Logged in as: ${CURRENT_USER}"

# ---------------------------------------------------------------------------
# 1. Collect secrets interactively (or from env)
# ---------------------------------------------------------------------------
info "Collecting secrets..."

prompt_secret() {
  local var="$1" prompt="$2"
  if [[ -z "${!var:-}" ]]; then
    echo -n "${prompt}: "
    read -rs value
    echo
    printf -v "$var" '%s' "$value"
  else
    info "  ${var} already set in environment — skipping prompt."
  fi
}

prompt_secret AIRWALLEX_CLIENT_ID   "Airwallex Client ID (prod)"
prompt_secret AIRWALLEX_API_KEY     "Airwallex API Key (prod)"
prompt_secret PQSAFE_API_KEY        "PQSafe API Key (bearer token for write endpoints, pick any strong secret)"

: "${AIRWALLEX_CLIENT_ID:?}"
: "${AIRWALLEX_API_KEY:?}"
: "${PQSAFE_API_KEY:?}"

# ---------------------------------------------------------------------------
# 2. Create app (idempotent — safe to re-run)
# ---------------------------------------------------------------------------
info "Creating Fly.io app '${APP_NAME}' in region '${APP_REGION}'..."

if $FLY apps list 2>/dev/null | grep -q "^${APP_NAME}"; then
  warn "App '${APP_NAME}' already exists — skipping creation."
else
  $FLY apps create "${APP_NAME}" --org personal 2>/dev/null || \
  $FLY apps create "${APP_NAME}" 2>/dev/null || \
  warn "Could not create app — it may already exist under a different org. Continuing."
fi

# ---------------------------------------------------------------------------
# 3. Set secrets
# ---------------------------------------------------------------------------
info "Setting secrets on '${APP_NAME}'..."

$FLY secrets set \
  AIRWALLEX_CLIENT_ID="${AIRWALLEX_CLIENT_ID}" \
  AIRWALLEX_API_KEY="${AIRWALLEX_API_KEY}" \
  AIRWALLEX_MODE="prod" \
  PQSAFE_API_KEY="${PQSAFE_API_KEY}" \
  --app "${APP_NAME}"

info "Secrets set."

# ---------------------------------------------------------------------------
# 4. Deploy
# ---------------------------------------------------------------------------
info "Deploying from ${REPO_ROOT}/api-reference ..."

cd "${REPO_ROOT}/api-reference"

$FLY deploy \
  --app "${APP_NAME}" \
  --config deploy/fly.toml \
  --dockerfile Dockerfile \
  --remote-only

info "Deploy complete."

# ---------------------------------------------------------------------------
# 5. Health check
# ---------------------------------------------------------------------------
info "Running health check..."
sleep 5

FLY_URL="https://${APP_NAME}.fly.dev"
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${FLY_URL}/health" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    info "Health check passed (HTTP ${STATUS}) — ${FLY_URL}/health"
    break
  fi
  warn "Health check attempt ${i}/5 — HTTP ${STATUS}. Waiting 10s..."
  sleep 10
done

if [[ "$STATUS" != "200" ]]; then
  warn "Health check still failing — app may still be starting. Check: $FLY logs --app ${APP_NAME}"
fi

# ---------------------------------------------------------------------------
# 6. Custom domain setup instructions
# ---------------------------------------------------------------------------
echo ""
info "---- Custom domain setup ----"
echo ""
echo "To attach api.pqsafe.xyz to this deployment:"
echo ""
echo "  1. Add the certificate to Fly:"
echo "       $FLY certs add api.pqsafe.xyz --app ${APP_NAME}"
echo ""
echo "  2. Get your target hostname:"
echo "       $FLY ips list --app ${APP_NAME}"
echo ""
echo "  3. Add a CNAME record in Namecheap (see deploy/DNS_INSTRUCTIONS.md)"
echo ""
echo "  4. Verify:"
echo "       $FLY certs check api.pqsafe.xyz --app ${APP_NAME}"
echo ""
info "API docs will be at: https://api.pqsafe.xyz/docs"
info "Version endpoint:    https://api.pqsafe.xyz/version"
info "Fly.io logs:         $FLY logs --app ${APP_NAME}"

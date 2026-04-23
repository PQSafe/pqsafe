#!/usr/bin/env bash
# @pqsafe/mastra — npm Publish Script
# Publishes @pqsafe/mastra to npm.
#
# Prerequisites:
#   npm login (or NPM_TOKEN env var for CI)
#
# Usage:
#   bash publish.sh              # production npm
#   bash publish.sh --dry-run    # dry run (no publish)
#   DRY_RUN=1 bash publish.sh    # build and test only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="@pqsafe/mastra"
DRY_RUN="${DRY_RUN:-0}"
NPM_DRY_RUN="${1:-}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[publish]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}   $*"; }
error() { echo -e "${RED}[error]${NC}  $*" >&2; exit 1; }

cd "${SCRIPT_DIR}"

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
info "Checking prerequisites..."
command -v node >/dev/null || error "node not found"
command -v npm >/dev/null  || error "npm not found"

if [[ "$DRY_RUN" != "1" && "$NPM_DRY_RUN" != "--dry-run" ]]; then
  if ! npm whoami &>/dev/null; then
    if [[ -n "${NPM_TOKEN:-}" ]]; then
      echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> ~/.npmrc
      info "Using NPM_TOKEN from environment"
    else
      error "Not logged in to npm. Run: npm login"
    fi
  else
    info "Logged in as: $(npm whoami)"
  fi
fi

# ---------------------------------------------------------------------------
# 1. Install dependencies
# ---------------------------------------------------------------------------
info "Installing dependencies..."
npm install

# ---------------------------------------------------------------------------
# 2. Run tests
# ---------------------------------------------------------------------------
info "Running tests..."
npm test

info "Tests passed."

# ---------------------------------------------------------------------------
# 3. Build
# ---------------------------------------------------------------------------
info "Building TypeScript..."
rm -rf dist/
npm run build

# Verify dist was produced
if [[ ! -f "dist/index.js" ]]; then
  error "Build failed — dist/index.js not found"
fi
info "Build complete. dist/index.js present."

# ---------------------------------------------------------------------------
# 4. Verify package contents
# ---------------------------------------------------------------------------
info "Verifying package contents..."
npm pack --dry-run

# ---------------------------------------------------------------------------
# 5. Publish
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]] || [[ "$NPM_DRY_RUN" == "--dry-run" ]]; then
  warn "Dry run — skipping publish."
  info "Run without --dry-run to publish."
  exit 0
fi

info "Publishing ${PACKAGE_NAME} to npm..."
npm publish --access public

info "Publish complete."

# ---------------------------------------------------------------------------
# 6. Smoke test — install from npm and verify
# ---------------------------------------------------------------------------
info "Running smoke test (install from npm)..."
SMOKE_DIR="$(mktemp -d)/smoke_test"
mkdir -p "${SMOKE_DIR}"
cd "${SMOKE_DIR}"

# Brief wait for npm registry to update
sleep 10

cat > package.json <<'PKGJSON'
{
  "name": "smoke-test",
  "version": "1.0.0",
  "type": "module"
}
PKGJSON

npm install --silent "@pqsafe/mastra"

node --input-type=module <<'NODESCRIPT'
import * as pqsafe from '@pqsafe/mastra'
console.log('@pqsafe/mastra imported successfully')
if (typeof pqsafe.createPQSafeTools !== 'function') {
  throw new Error('createPQSafeTools not exported')
}
const tools = pqsafe.createPQSafeTools({ apiKey: 'test', baseUrl: 'https://api.pqsafe.xyz' })
console.log(`Tools registered: ${Object.keys(tools).join(', ')}`)
console.log('Smoke test PASSED')
NODESCRIPT

info "Smoke test passed."
info "Package live at: https://www.npmjs.com/package/@pqsafe/mastra"

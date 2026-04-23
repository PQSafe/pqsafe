#!/usr/bin/env bash
# PQSafe Python SDK — PyPI Publish Script
# Publishes pqsafe-agent-pay to PyPI.
#
# Prerequisites:
#   pip install build twine
#   PyPI API token set in ~/.pypirc or TWINE_PASSWORD env var
#
# Usage:
#   bash publish.sh              # publish to PyPI (production)
#   bash publish.sh --test       # publish to TestPyPI first
#   DRY_RUN=1 bash publish.sh    # build and smoke test only, no upload

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="pqsafe-agent-pay"
TEST_PYPI="${1:-}"
DRY_RUN="${DRY_RUN:-0}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[publish]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}   $*"; }
error() { echo -e "${RED}[error]${NC}  $*" >&2; exit 1; }

cd "${SCRIPT_DIR}"

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
info "Checking prerequisites..."
python3 -c "import build" 2>/dev/null || { warn "Installing build..."; pip install --quiet build; }
python3 -c "import twine" 2>/dev/null || { warn "Installing twine..."; pip install --quiet twine; }

# ---------------------------------------------------------------------------
# 1. Run tests
# ---------------------------------------------------------------------------
info "Running tests..."
if python3 -c "import pqcrypto" 2>/dev/null; then
  info "pqcrypto available — tests will run with ML-DSA-65 backend"
else
  warn "pqcrypto not installed — tests will run with Ed25519 fallback backend"
fi

pip install --quiet -e ".[dev]" 2>/dev/null || pip install --quiet -e .
python3 -m pytest tests/ -v --tb=short

info "All tests passed."

# ---------------------------------------------------------------------------
# 2. Clean previous builds
# ---------------------------------------------------------------------------
info "Cleaning dist/..."
rm -rf dist/ *.egg-info src/*.egg-info

# ---------------------------------------------------------------------------
# 3. Build
# ---------------------------------------------------------------------------
info "Building wheel + sdist..."
python3 -m build

# Verify wheel contents
info "Verifying wheel..."
python3 -m twine check dist/*

# ---------------------------------------------------------------------------
# 4. Upload
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  warn "DRY_RUN=1 — skipping upload. Built artifacts are in dist/"
  ls -la dist/
  exit 0
fi

if [[ "$TEST_PYPI" == "--test" ]]; then
  info "Uploading to TestPyPI..."
  python3 -m twine upload \
    --repository-url https://test.pypi.org/legacy/ \
    dist/*
  INSTALL_INDEX="--index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/"
else
  info "Uploading to PyPI..."
  python3 -m twine upload dist/*
  INSTALL_INDEX=""
fi

info "Upload complete."

# ---------------------------------------------------------------------------
# 5. Smoke test — install from PyPI and verify import
# ---------------------------------------------------------------------------
info "Running smoke test (install from PyPI in fresh venv)..."
VENV_DIR="$(mktemp -d)/smoke_venv"
python3 -m venv "${VENV_DIR}"

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

# Brief wait for PyPI index to update
sleep 5

pip install --quiet ${INSTALL_INDEX} "${PACKAGE_NAME}"

python3 - <<'EOF'
from pqsafe import generate_keypair, create_envelope, sign_envelope, verify_envelope, __version__

print(f"pqsafe-agent-pay {__version__} imported successfully")

kp = generate_keypair()
env = create_envelope(
    issuer="pq1" + "a" * 40,
    agent="smoke-test",
    max_amount=10.0,
    currency="USD",
    allowed_recipients=["GB29NWBK60161331926819"],
)
signed = sign_envelope(env, kp)
verified = verify_envelope(signed, skip_temporal=False)
assert verified.max_amount == 10.0
print("Smoke test PASSED: generate_keypair -> create_envelope -> sign_envelope -> verify_envelope OK")
EOF

deactivate
info "Smoke test passed."
info "Package live at: https://pypi.org/project/${PACKAGE_NAME}/"

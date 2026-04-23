#!/usr/bin/env bash
# crewai-pqsafe — PyPI Publish Script
# Publishes crewai-pqsafe to PyPI.
#
# Usage:
#   bash publish.sh              # production PyPI
#   bash publish.sh --test       # TestPyPI
#   DRY_RUN=1 bash publish.sh    # build only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="crewai-pqsafe"
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
python3 -c "import build" 2>/dev/null || pip install --quiet build
python3 -c "import twine" 2>/dev/null || pip install --quiet twine

# ---------------------------------------------------------------------------
# 1. Run tests
# ---------------------------------------------------------------------------
info "Installing dev dependencies and running tests..."
pip install --quiet -e ".[dev]" 2>/dev/null || pip install --quiet -e .
python3 -m pytest tests/ -v --tb=short

info "Tests passed."

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
info "Cleaning and building..."
rm -rf dist/ *.egg-info src/*.egg-info
python3 -m build
python3 -m twine check dist/*

# ---------------------------------------------------------------------------
# 3. Upload
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  warn "DRY_RUN=1 — skipping upload."
  ls -la dist/
  exit 0
fi

if [[ "$TEST_PYPI" == "--test" ]]; then
  info "Uploading to TestPyPI..."
  python3 -m twine upload --repository-url https://test.pypi.org/legacy/ dist/*
  INSTALL_INDEX="--index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/"
else
  info "Uploading to PyPI..."
  python3 -m twine upload dist/*
  INSTALL_INDEX=""
fi

# ---------------------------------------------------------------------------
# 4. Smoke test
# ---------------------------------------------------------------------------
info "Running smoke test..."
VENV_DIR="$(mktemp -d)/smoke_venv"
python3 -m venv "${VENV_DIR}"
source "${VENV_DIR}/bin/activate"
sleep 5
pip install --quiet ${INSTALL_INDEX} "${PACKAGE_NAME}"

python3 - <<'EOF'
from crewai_pqsafe import PQSafePaymentTool
print(f"crewai-pqsafe imported successfully")
tool = PQSafePaymentTool(api_key="test", base_url="https://api.pqsafe.xyz")
print(f"Tool name: {tool.name}")
print("Smoke test PASSED")
EOF

deactivate
info "Smoke test passed."
info "Package live at: https://pypi.org/project/${PACKAGE_NAME}/"

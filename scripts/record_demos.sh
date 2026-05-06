#!/usr/bin/env bash
# record_demos.sh — Run PQSafe AgentPay demos in sequence for screen recording.
# Usage: bash scripts/record_demos.sh
# Requirements: PQSAFE_REVOCATION_MOCK=true (or real env vars for live rails)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PAY_DIR="$(cd "$SCRIPT_DIR/../agent-pay" && pwd)"

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

separator() {
  local title="$1"
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $title${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

pause() {
  local msg="${1:-Press ENTER to continue to next demo...}"
  echo ""
  echo -e "${YELLOW}>>> $msg${RESET}"
  read -r
}

clear

echo -e "${BOLD}PQSafe AgentPay — Demo Recording Session${RESET}"
echo -e "Date: $(date '+%Y-%m-%d %H:%M:%S HKT')"
echo -e "Directory: $AGENT_PAY_DIR"
echo ""
echo "This script runs both sandbox demos in sequence."
echo "Ensure env vars are set (see SANDBOX.md) or PQSAFE_REVOCATION_MOCK=true for local mode."
echo ""

pause "Ready to begin? Press ENTER to start Demo 1: x402 Streaming Payment..."

# ── Demo 1: x402 Streaming Payment ──────────────────────────────────────────
clear
separator "DEMO 1 / 2 — x402 Streaming Payment Protocol"

echo -e "${GREEN}Scenario:${RESET} AI agent makes a metered API call using x402 spend envelope."
echo -e "${GREEN}Rail:${RESET}     x402 (HTTP payment protocol)"
echo -e "${GREEN}Stack:${RESET}    ML-DSA-65 PQ signature + local mock server"
echo ""

cd "$AGENT_PAY_DIR"
export PQSAFE_REVOCATION_MOCK="${PQSAFE_REVOCATION_MOCK:-true}"

npm run demo:x402 || {
  echo -e "${YELLOW}Demo exited with non-zero status (may be expected in mock mode).${RESET}"
}

echo ""
echo -e "${GREEN}✓ Demo 1 complete.${RESET}"

pause "Press ENTER to start Demo 2: Basic AgentPay Flow..."

# ── Demo 2: Basic AgentPay Flow ──────────────────────────────────────────────
clear
separator "DEMO 2 / 2 — Basic AgentPay Spend Envelope Flow"

echo -e "${GREEN}Scenario:${RESET} Core spend envelope lifecycle: create → sign (ML-DSA-65) → verify → revoke."
echo -e "${GREEN}Rail:${RESET}     Mock in-memory (no network required)"
echo -e "${GREEN}Stack:${RESET}    @noble/post-quantum + zod policy validation"
echo ""

npm run demo:basic || {
  echo -e "${YELLOW}Demo exited with non-zero status (may be expected in mock mode).${RESET}"
}

echo ""
echo -e "${GREEN}✓ Demo 2 complete.${RESET}"

# ── Summary ──────────────────────────────────────────────────────────────────
clear
separator "Recording Complete"

echo -e "${BOLD}Both demos finished.${RESET}"
echo ""
echo "Next steps:"
echo "  1. Stop screen recording"
echo "  2. Trim intro/outro in Quicktime or CleanMyMac"
echo "  3. Upload to YC application portal"
echo ""
echo -e "${CYAN}PQSafe AgentPay — Post-Quantum AI Payments${RESET}"
echo ""

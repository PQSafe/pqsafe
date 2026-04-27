#!/usr/bin/env bash
# ============================================================================
# VerifyOnEtherscan.sh — Verify SpendEnvelopeRegistryV2_1 on Arbiscan Sepolia
# ============================================================================
#
# USAGE:
#   cd ~/Projects/pqsafe/evm
#   bash script/VerifyOnEtherscan.sh
#
# The script reads the deployed contract address from the forge broadcast JSON:
#   broadcast/DeployV2_1_Sepolia.s.sol/421614/run-latest.json
#
# REQUIRED ENV VARS:
#   ETHERSCAN_API_KEY   — Arbiscan API key (same key works for mainnet + Sepolia)
#   ADMIN_ADDRESS       — must match what was passed during deploy (constructor arg)
#
# OPTIONAL:
#   CONTRACT_ADDRESS    — override address detection (skip broadcast JSON parsing)
#
# REFERENCES:
#   forge verify-contract docs: https://book.getfoundry.sh/reference/forge/forge-verify-contract
#   Arbiscan Sepolia API:       https://api-sepolia.arbiscan.io/api
# ============================================================================

set -euo pipefail

CHAIN_ID=421614
ETHERSCAN_URL="https://api-sepolia.arbiscan.io/api"
BROADCAST_JSON="broadcast/DeployV2_1_Sepolia.s.sol/${CHAIN_ID}/run-latest.json"
CONTRACT_NAME="SpendEnvelopeRegistryV2_1"
COMPILER_VERSION="0.8.24"
# Matches foundry.toml: optimizer=true, optimizer_runs=200
OPTIMIZER_RUNS=200

# ── Validate env vars ────────────────────────────────────────────────────────
if [[ -z "${ETHERSCAN_API_KEY:-}" ]]; then
  echo "ERROR: ETHERSCAN_API_KEY is not set"
  echo "  export ETHERSCAN_API_KEY=<your arbiscan API key>"
  exit 1
fi

if [[ -z "${ADMIN_ADDRESS:-}" ]]; then
  echo "ERROR: ADMIN_ADDRESS is not set (must match deploy constructor arg)"
  echo "  export ADMIN_ADDRESS=<your testnet wallet address>"
  exit 1
fi

# ── Resolve contract address ─────────────────────────────────────────────────
if [[ -n "${CONTRACT_ADDRESS:-}" ]]; then
  ADDR="${CONTRACT_ADDRESS}"
  echo "Using CONTRACT_ADDRESS override: ${ADDR}"
else
  if [[ ! -f "${BROADCAST_JSON}" ]]; then
    echo "ERROR: Broadcast JSON not found: ${BROADCAST_JSON}"
    echo "  Did you run DeployV2_1_Sepolia.s.sol with --broadcast first?"
    echo "  Or set: export CONTRACT_ADDRESS=<deployed address>"
    exit 1
  fi
  # Extract the first 'contractAddress' from the broadcast JSON
  ADDR=$(python3 -c "
import json, sys
with open('${BROADCAST_JSON}') as f:
    data = json.load(f)
txs = data.get('transactions', [])
for tx in txs:
    addr = tx.get('contractAddress', '')
    if addr and addr != 'null' and addr is not None:
        print(addr)
        sys.exit(0)
sys.exit(1)
" 2>/dev/null) || {
    echo "ERROR: Could not parse contractAddress from ${BROADCAST_JSON}"
    echo "  Try: export CONTRACT_ADDRESS=<deployed address>"
    exit 1
  }
  echo "Detected contract address from broadcast JSON: ${ADDR}"
fi

echo ""
echo "================================================================"
echo "  Verifying ${CONTRACT_NAME} on Arbitrum Sepolia"
echo "  Address:    ${ADDR}"
echo "  Chain ID:   ${CHAIN_ID}"
echo "  Etherscan:  ${ETHERSCAN_URL}"
echo "================================================================"
echo ""

# ── Run forge verify-contract ────────────────────────────────────────────────
# Constructor arg is a single address (admin) — ABI-encoded as 32 bytes (padded left).
# We use cast abi-encode to generate the correct constructor args.
CONSTRUCTOR_ARGS=$(~/.foundry/bin/cast abi-encode "constructor(address)" "${ADMIN_ADDRESS}")

echo "Constructor args (ABI-encoded): ${CONSTRUCTOR_ARGS}"
echo ""

~/.foundry/bin/forge verify-contract \
  --chain-id "${CHAIN_ID}" \
  --etherscan-api-key "${ETHERSCAN_API_KEY}" \
  --verifier-url "${ETHERSCAN_URL}" \
  --compiler-version "v${COMPILER_VERSION}+commit.7893614a" \
  --num-of-optimizations "${OPTIMIZER_RUNS}" \
  --constructor-args "${CONSTRUCTOR_ARGS}" \
  "${ADDR}" \
  src/SpendEnvelopeRegistryV2_1.sol:SpendEnvelopeRegistryV2_1

echo ""
echo "================================================================"
echo "  Verification submitted."
echo "  Check status at:"
echo "  https://sepolia.arbiscan.io/address/${ADDR}#code"
echo "================================================================"

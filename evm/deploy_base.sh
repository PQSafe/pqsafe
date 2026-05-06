#!/bin/bash
# PQSafe Base mainnet deploy — one-command script
# Usage: bash deploy_base.sh
set -e
cd "$(dirname "$0")"

echo "=== Loading .env ==="
set -a; source .env; set +a

DEPLOYER_ADDR="0xaBB383d3B50b7698d92DaB1BDbB1aa467F3Dc843"
echo "Deployer address: $DEPLOYER_ADDR"

echo ""
echo "=== Checking Base mainnet balance ==="
BAL_HEX=$(curl -sS -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$DEPLOYER_ADDR\",\"latest\"],\"id\":1}" \
  "$BASE_RPC_URL" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
BAL_DEC=$(python3 -c "print(int('$BAL_HEX', 16))")
BAL_ETH=$(python3 -c "print($BAL_DEC / 10**18)")
echo "Balance: $BAL_ETH ETH"

if [ "$BAL_DEC" = "0" ]; then
  echo ""
  echo "❌ STOP — wallet has 0 ETH on Base."
  echo ""
  echo "👉 Send ~0.005 ETH (worth about \$15) to:"
  echo "   $DEPLOYER_ADDR"
  echo "   on Base mainnet (chain id 8453)"
  echo ""
  echo "Easiest paths to get ETH on Base:"
  echo "  • Coinbase exchange: withdraw ETH directly to Base network"
  echo "  • MetaMask: add Base network, bridge from L1 via https://bridge.base.org"
  echo "  • Already have ETH on Ethereum L1: bridge it via https://bridge.base.org (~3-5 min)"
  echo ""
  echo "Then re-run: bash deploy_base.sh"
  exit 0
fi

echo ""
echo "=== Running dry-run simulation (no broadcast, no gas) ==="
~/.foundry/bin/forge script script/DeployV2_1_Mainnet.s.sol --rpc-url base 2>&1 | tail -20

echo ""
read -p "Dry-run looks good? Proceed with REAL DEPLOY (gas ~\$0.05)? [y/N] " ans
if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
  echo "Aborted. Re-run when ready."
  exit 0
fi

echo ""
echo "=== Broadcasting deploy to Base mainnet ==="
if [ -n "$BASESCAN_API_KEY" ] && [ "$BASESCAN_API_KEY" != "YOUR_BASESCAN_KEY" ]; then
  ~/.foundry/bin/forge script script/DeployV2_1_Mainnet.s.sol \
    --rpc-url base --broadcast --verify --etherscan-api-key "$BASESCAN_API_KEY"
else
  echo "(BASESCAN_API_KEY not set — deploying without source verification. You can verify later.)"
  ~/.foundry/bin/forge script script/DeployV2_1_Mainnet.s.sol \
    --rpc-url base --broadcast
fi

echo ""
echo "✅ Deploy complete. Contract address printed above. Save it for landing/spec/contracts.json."

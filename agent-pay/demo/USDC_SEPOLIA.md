# USDC Base Sepolia — Real Testnet Transfer Demo

**Goal:** send a real test USDC transfer on Base Sepolia testnet and get a transaction hash verifiable on https://sepolia.basescan.org.

## Status

Pending Raymond running the demo. See DEMO_RECEIPTS.md for receipt placeholder.

---

## Prerequisites

This demo requires:
1. An EVM wallet (MetaMask or any EVM-compatible wallet)
2. Testnet ETH on Base Sepolia (for gas)
3. Test USDC on Base Sepolia (very small amount — 0.01 USDC is enough)
4. `viem` npm package (one-time install)

---

## Step 1 — Install viem (1 min)

The demo uses viem for EVM signing. It's not in the main `package.json` to keep the SDK lean.

```bash
cd ~/Projects/pqsafe/agent-pay
npm install viem
```

## Step 2 — Get a test wallet private key (5 min)

**Option A — Use an existing MetaMask wallet:**
1. Open MetaMask → click account icon → Account details → Export private key
2. Enter your MetaMask password
3. Copy the 64-character hex private key
4. Make sure this is a **testnet-only wallet with no real funds**

**Option B — Create a fresh testnet wallet (recommended):**
```bash
node -e "
const crypto = require('crypto');
const pk = crypto.randomBytes(32).toString('hex');
console.log('Private key: 0x' + pk);
// Derive address manually or use MetaMask: import the key to get the address
"
```
Or use any online EVM wallet generator (acceptable for testnet-only keys).

## Step 3 — Get testnet ETH on Base Sepolia (5 min)

Your wallet needs a small amount of Base Sepolia ETH to pay for gas.

**Faucets (free):**
- https://faucets.chain.link/base-sepolia (Chainlink — reliable)
- https://www.alchemy.com/faucets/base-sepolia (Alchemy — requires account)
- https://bridge.base.org/deposit (bridge from Sepolia ETH)

Request ~0.01 ETH — enough for many transactions.

Wait 1-2 minutes for the faucet transaction to confirm, then verify at:
https://sepolia.basescan.org/address/YOUR_ADDRESS

## Step 4 — Get test USDC on Base Sepolia (5 min)

USDC contract on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Option A — Circle USDC testnet faucet:**
1. Go to https://faucet.circle.com
2. Select **USDC** + **Base Sepolia**
3. Enter your wallet address
4. Receive 10 USDC (free, for testing)

**Option B — Uniswap on Base Sepolia:**
- Bridge testnet ETH to WETH, then swap for USDC on the Sepolia Uniswap

The demo only needs 0.01 USDC — so even 0.1 USDC from any source is fine.

## Step 5 — Set up a recipient address (1 min)

You need a recipient 0x address to send the test USDC to. This can be:
- A second wallet you control
- The same wallet (send to yourself — valid for testing)
- Any valid 0x Ethereum address format

## Step 6 — Populate ~/.pqsafe-usdc.env (2 min)

```bash
cat > ~/.pqsafe-usdc.env << 'EOF'
# USDC Base Sepolia Demo Credentials
# DO NOT commit this file
# Use a testnet-only wallet with no real funds

# Your EVM wallet private key (64 hex chars, with or without 0x prefix)
EVM_PRIVATE_KEY=0x_your_private_key_here

# Recipient EVM address (0x-prefixed, 40 hex chars)
EVM_RECIPIENT_ADDRESS=0x_recipient_address_here

# Optional: custom RPC URL (default: https://sepolia.base.org)
# BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
EOF

chmod 600 ~/.pqsafe-usdc.env
```

## Step 7 — Run the demo (2 min)

```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/usdc-sepolia-demo.ts
```

Expected output:
```
  Step 6  Execute USDC transfer on Base Sepolia
  ────────────────────────────────────────────────────────────────────────
  Amount                 0.01 USDC
  To                     0xRecipient...

  Transaction hash       0x1234abcd...
  Amount                 0.01 USDC
  Network                Base Sepolia (testnet)
  USDC contract          0x036CbD53842c5426634e7929541eC2318f3dCF7e
  Mock                   false — real Sepolia transaction
  ✓ Transfer executed. Add this tx hash to DEMO_RECEIPTS.md.

Verify at:
  https://sepolia.basescan.org/tx/0x1234abcd...
```

## Step 8 — Verify on Basescan

After running the demo:
1. Open https://sepolia.basescan.org/tx/YOUR_TX_HASH
2. You should see:
   - **To:** USDC contract address (`0x036CBD...`)
   - **From:** your wallet
   - **Status:** Success
   - **Token Transfer:** 0.01 USDC from your wallet to recipient

## Step 9 — Add to DEMO_RECEIPTS.md

Add the transaction hash to DEMO_RECEIPTS.md under the USDC-Base section.

---

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `viem is not installed` | viem not in node_modules | Run `npm install viem` in agent-pay dir |
| `EVM_PRIVATE_KEY not set` | Env file missing | Check `~/.pqsafe-usdc.env` |
| `insufficient funds for gas` | No testnet ETH | Get from faucet (Step 3) |
| `ERC20: transfer amount exceeds balance` | No test USDC | Get from Circle faucet (Step 4) |
| `invalid hex string` | Private key format wrong | Include `0x` prefix, or remove it — both work |
| `nonce too low` | Tx replay issue | Wait 30s and retry |
| Transaction pending >2 min | RPC congestion | Try a different RPC: `https://base-sepolia.g.alchemy.com/v2/demo` |

## Network details

| Property | Value |
|---|---|
| Network | Base Sepolia |
| Chain ID | 84532 |
| RPC | https://sepolia.base.org |
| Explorer | https://sepolia.basescan.org |
| USDC contract | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| ETH faucet | https://faucets.chain.link/base-sepolia |
| USDC faucet | https://faucet.circle.com |

## How the code works

The demo uses `src/rails/usdc-base.ts` with a viem-based `signAndSend` injector:

1. Encode ERC-20 `transfer(address,uint256)` calldata (pure `@noble/hashes`, no viem)
2. Inject a viem `walletClient.sendTransaction()` as the `signAndSend` function
3. The rail calls `signAndSend({ to: usdcContract, data: calldata, network, chainId, ... })`
4. viem signs + broadcasts the transaction
5. The returned tx hash is the `txId` in `PaymentResult`

## Estimated time

| Step | Time |
|---|---|
| Install viem | 1 min |
| Get/create testnet wallet | 5 min |
| Get testnet ETH from faucet | 5 min (includes wait) |
| Get test USDC from faucet | 3 min (includes wait) |
| Populate .env file | 2 min |
| Run demo + get tx hash | 1 min |
| **Total** | **~17 min** |

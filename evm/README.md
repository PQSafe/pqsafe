# PQSafe SpendEnvelope Registry — EVM

On-chain audit ledger for PQSafe AgentPay **SpendEnvelopes** on Arbitrum.

An AI agent operator calls `commit()` before a payment to immutably record the ML-DSA-65 post-quantum authorization on-chain. Auditors, compliance officers, and counter-parties can verify any payment was pre-authorized without trusting the operator.

## Architecture

```
Off-chain (TypeScript SDK)          On-chain (Arbitrum)
─────────────────────────           ──────────────────────────────────
1. Generate ML-DSA-65 keypair
2. Sign SpendEnvelope JSON    ──→   3. commit(keccak256(json), sigFingerprint, ...)
4. Execute payment via Airwallex ─→ 5. markUsed(envelopeId, txReference, amountUsed)
                                   6. Anyone: isCommitted() / getRecord()
```

ML-DSA-65 signature verification is **not** done on-chain (would cost ~50M gas for a naive Solidity port). Instead:
1. Operator verifies signature off-chain via `@pqsafe/agent-pay` SDK
2. Operator commits `keccak256(envelopeJson)` + first 32 bytes of sig (fingerprint) on-chain
3. Anyone can re-verify the ML-DSA-65 signature off-chain using the full envelope JSON

## Contract

```solidity
// Commit a SpendEnvelope before payment
function commit(
    bytes32 envelopeId,      // keccak256(envelopeJsonBytes)
    bytes32 sigFingerprint,  // mlDsa65Signature[0:32]
    string  calldata agent,  // e.g. "research-agent-v1"
    uint128 maxAmount,       // spend ceiling, scaled by 1e6 ($50.00 = 50_000_000)
    bytes3  currency,        // ISO 4217 as bytes3 ("USD", "HKD")
    uint64  validUntil,      // Unix timestamp
    bytes16 nonce            // 128-bit anti-replay nonce from envelope
) external;

// Mark envelope as used after payment executes
function markUsed(
    bytes32 envelopeId,
    bytes32 txReference,  // Airwallex UUID as bytes32
    uint128 amountUsed    // actual amount charged (≤ maxAmount)
) external;

// View
function isCommitted(bytes32 envelopeId) external view returns (bool);
function isUsed(bytes32 envelopeId) external view returns (bool);
function getRecord(bytes32 envelopeId) external view returns (EnvelopeRecord memory);
function computeEnvelopeId(bytes calldata envelopeJsonBytes) external pure returns (bytes32);
```

## Deployed Addresses

| Network           | Address |
|-------------------|---------|
| Arbitrum One      | _TBD_   |
| Arbitrum Sepolia  | [0x142bA5626bf8B032EB0B59052421C42595417F5d](https://sepolia.arbiscan.io/address/0x142bA5626bf8B032EB0B59052421C42595417F5d#code) |

## Setup

### Prerequisites

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Install

```bash
cd evm
forge install foundry-rs/forge-std
```

### Build

```bash
forge build
```

### Test

```bash
forge test -vv
```

Expected output: all 13 tests passing (11 unit + 2 fuzz).

### Deploy to Arbitrum Sepolia (testnet)

```bash
export PRIVATE_KEY=0x...          # deployer wallet private key
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

forge script script/Deploy.s.sol \
  --rpc-url arbitrum_sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvvv
```

### Deploy to Arbitrum One (mainnet)

```bash
export PRIVATE_KEY=0x...
export ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

forge script script/Deploy.s.sol \
  --rpc-url arbitrum_one \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvvv
```

## TypeScript Integration

```typescript
import { createAgentPay } from '@pqsafe/agent-pay';
import { keccak256, toHex } from 'viem';

const ap = createAgentPay({ /* config */ });
const envelope = await ap.createAndSignEnvelope({ /* params */ });

// Compute on-chain ID
const envelopeJsonBytes = Buffer.from(JSON.stringify(envelope));
const envelopeId = keccak256(envelopeJsonBytes);

// First 32 bytes of ML-DSA-65 signature as fingerprint
const sigBytes = Buffer.from(envelope.signature, 'base64');
const sigFingerprint = toHex(sigBytes.slice(0, 32), { size: 32 });

// Call commit() on-chain before executing payment
// Call markUsed() after Airwallex returns a transaction ID
```

## Security Model

- **Only the committing operator** can mark an envelope as used
- **Replay protection**: each `envelopeId` can only be committed once
- **Expiry check**: `validUntil > block.timestamp` enforced at commit time
- **Spend cap**: `amountUsed ≤ maxAmount` enforced at markUsed time
- **Immutable audit log**: committed records cannot be modified or deleted

## Why Arbitrum?

- ~$0.01 gas per `commit()` vs ~$5 on Ethereum mainnet
- 250ms finality (suitable for real-time payment flows)
- EVM-equivalent (same Solidity, same tooling)
- Arbitrum Trailblazer AI Grant recipient (D1 deliverable)

## License

MIT

[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / commitEnvelopeToArbitrum

# Function: commitEnvelopeToArbitrum()

> **commitEnvelopeToArbitrum**(`signed`, `envelopeData`, `config`): `Promise`\<[`CommitResult`](../interfaces/CommitResult.md)\>

Defined in: [agent-pay/src/arbitrum.ts:191](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L191)

Commit a signed SpendEnvelope to the Arbitrum SpendEnvelope Registry.

This is the D2 integration point: called automatically by executeAgentPayment()
when an `arbitrum` config is provided, just before (or immediately after)
the off-chain payment executes.

## Parameters

### signed

[`SignedEnvelope`](../interfaces/SignedEnvelope.md)

### envelopeData

#### agent

`string`

#### currency

`string`

#### maxAmount

`number`

#### nonce

`string`

#### validUntil

`number`

### config

[`ArbitrumCommitConfig`](../interfaces/ArbitrumCommitConfig.md)

## Returns

`Promise`\<[`CommitResult`](../interfaces/CommitResult.md)\>

## Example

```typescript
import { keccak256 } from '@noble/hashes/sha3'
import { commitEnvelopeToArbitrum } from '@pqsafe/agent-pay/arbitrum'

const result = await commitEnvelopeToArbitrum(signedEnvelope, envelope, {
  rpcUrl: process.env.ARBITRUM_RPC_URL!,
  contractAddress: '0x...',
  privateKey: process.env.ARBITRUM_PRIVATE_KEY!,
  chainId: 421614, // Arbitrum Sepolia
  keccak256,
})
console.log('Committed on-chain:', result.txHash)
```

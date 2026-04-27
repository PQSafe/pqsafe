[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ArbitrumCommitConfig

# Interface: ArbitrumCommitConfig

Defined in: [agent-pay/src/arbitrum.ts:147](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L147)

## Extends

- `ArbitrumRegistryConfig`

## Properties

### chainId

> **chainId**: `number`

Defined in: [agent-pay/src/arbitrum.ts:34](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L34)

Chain ID: 42161 for Arbitrum One, 421614 for Arbitrum Sepolia

#### Inherited from

`ArbitrumRegistryConfig.chainId`

***

### contractAddress

> **contractAddress**: `string`

Defined in: [agent-pay/src/arbitrum.ts:27](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L27)

Deployed SpendEnvelopeRegistry contract address (hex, checksummed)

#### Inherited from

`ArbitrumRegistryConfig.contractAddress`

***

### keccak256

> **keccak256**: (`data`) => `Uint8Array`

Defined in: [agent-pay/src/arbitrum.ts:149](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L149)

Injected keccak256 function (from @noble/hashes or viem)

#### Parameters

##### data

`Uint8Array`

#### Returns

`Uint8Array`

***

### privateKey

> **privateKey**: `string`

Defined in: [agent-pay/src/arbitrum.ts:32](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L32)

Operator private key (hex, 0x-prefixed). Used to sign the commit() tx.
Never log or expose this. Use an env var: process.env.ARBITRUM_PRIVATE_KEY

#### Inherited from

`ArbitrumRegistryConfig.privateKey`

***

### rpcUrl

> **rpcUrl**: `string`

Defined in: [agent-pay/src/arbitrum.ts:25](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L25)

RPC URL for Arbitrum One or Arbitrum Sepolia

#### Inherited from

`ArbitrumRegistryConfig.rpcUrl`

***

### signTx?

> `optional` **signTx?**: (`txParams`, `privateKey`) => `Promise`\<`string`\>

Defined in: [agent-pay/src/arbitrum.ts:156](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L156)

Optional: injected Ethereum tx signing function.
If omitted, the client will use eth_sendTransaction (requires unlocked account).
For production, inject a signing function from viem or ethers:
  signTx: (txParams, privateKey) => Promise<string>  // returns signed hex tx

#### Parameters

##### txParams

[`EthTxParams`](EthTxParams.md)

##### privateKey

`string`

#### Returns

`Promise`\<`string`\>

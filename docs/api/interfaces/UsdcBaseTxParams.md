[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / UsdcBaseTxParams

# Interface: UsdcBaseTxParams

Defined in: [agent-pay/src/rails/usdc-base.ts:79](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L79)

Caller-injected wallet function. PQSafe calls this with:
  to      — USDC contract address
  data    — ABI-encoded transfer(address,uint256) calldata
  network — "mainnet" | "sepolia"

Should return the 0x-prefixed transaction hash.

Example with viem:
  const signAndSend: UsdcBaseSignAndSend = async ({ to, data, network }) =>
    walletClient.sendTransaction({ to, data, chain: network === 'mainnet' ? base : baseSepolia })

Example with CDP AgentKit:
  const signAndSend: UsdcBaseSignAndSend = async ({ to, data, network }) => {
    const tx = await agentkit.sendTransaction({ to, data, network: `base-${network}` })
    return tx.transactionHash
  }

## Properties

### amount

> **amount**: `number`

Defined in: [agent-pay/src/rails/usdc-base.ts:91](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L91)

Human-readable amount

***

### atomicAmount

> **atomicAmount**: `bigint`

Defined in: [agent-pay/src/rails/usdc-base.ts:89](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L89)

Amount in USDC atomic units (6 decimals)

***

### chainId

> **chainId**: `number`

Defined in: [agent-pay/src/rails/usdc-base.ts:87](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L87)

Chain ID for EIP-155 replay protection

***

### data

> **data**: `string`

Defined in: [agent-pay/src/rails/usdc-base.ts:83](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L83)

ABI-encoded transfer(address,uint256) calldata (0x-prefixed hex)

***

### network

> **network**: [`BaseNetwork`](../type-aliases/BaseNetwork.md)

Defined in: [agent-pay/src/rails/usdc-base.ts:85](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L85)

"mainnet" or "sepolia"

***

### to

> **to**: `string`

Defined in: [agent-pay/src/rails/usdc-base.ts:81](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L81)

USDC contract address on the target network

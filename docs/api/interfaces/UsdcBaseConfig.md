[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / UsdcBaseConfig

# Interface: UsdcBaseConfig

Defined in: [agent-pay/src/rails/usdc-base.ts:96](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L96)

## Properties

### network?

> `optional` **network?**: [`BaseNetwork`](../type-aliases/BaseNetwork.md)

Defined in: [agent-pay/src/rails/usdc-base.ts:100](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L100)

"mainnet" | "sepolia" — overrides BASE_NETWORK env var

***

### signAndSend?

> `optional` **signAndSend?**: [`UsdcBaseSignAndSend`](../type-aliases/UsdcBaseSignAndSend.md)

Defined in: [agent-pay/src/rails/usdc-base.ts:98](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L98)

Wallet/signing delegate. Required for real mode.

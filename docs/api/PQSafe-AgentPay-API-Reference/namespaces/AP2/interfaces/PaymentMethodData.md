[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / PaymentMethodData

# Interface: PaymentMethodData

Defined in: [agent-pay/src/adapters/ap2.ts:74](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L74)

Payment method data — identifies the payment rail and associated
credentials or token references.

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:84](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L84)

Rail-specific data object.
For Stripe: { paymentMethodId: string }
For Wise: { ibanAccount: string }
For USDC-Base: { evmAddress: string, chainId: number }
For x402: { url: string }

***

### supportedMethods

> **supportedMethods**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:76](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L76)

Rail identifier (e.g. "stripe", "wise", "usdc-base", "x402")

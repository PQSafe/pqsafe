[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / PaymentResponse

# Interface: PaymentResponse

Defined in: [agent-pay/src/adapters/ap2.ts:258](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L258)

PaymentResponse — returned by the agent after completing a payment.
Mirrors the W3C PaymentResponse object.

## Properties

### details

> **details**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:264](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L264)

Method-specific payment details

***

### methodName

> **methodName**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:262](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L262)

Selected payment method identifier

***

### payerEmail?

> `optional` **payerEmail?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:270](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L270)

Optional buyer email

***

### payerPhone?

> `optional` **payerPhone?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:272](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L272)

Optional buyer phone

***

### pqPublicKey?

> `optional` **pqPublicKey?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:276](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L276)

PQSafe extension: hex-encoded DSA public key that produced pqSignature

***

### pqSignature?

> `optional` **pqSignature?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:274](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L274)

PQSafe extension: ML-DSA-65 signature over the mandate

***

### requestId

> **requestId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:260](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L260)

Echo of the originating request ID

***

### shippingAddress?

> `optional` **shippingAddress?**: [`ContactAddress`](ContactAddress.md)

Defined in: [agent-pay/src/adapters/ap2.ts:266](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L266)

Optional buyer shipping address (if requestShipping=true)

***

### shippingOption?

> `optional` **shippingOption?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:268](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L268)

Optional selected shipping option ID

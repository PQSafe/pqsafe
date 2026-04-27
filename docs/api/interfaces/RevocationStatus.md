[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / RevocationStatus

# Interface: RevocationStatus

Defined in: [agent-pay/src/sprint2/revocation.ts:66](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L66)

Full result of a revocation check.

## Properties

### failedOpen?

> `optional` **failedOpen?**: `boolean`

Defined in: [agent-pay/src/sprint2/revocation.ts:76](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L76)

true = check was fail-opened (service unreachable, low-value payment).

***

### layer?

> `optional` **layer?**: `2` \| `1` \| `3`

Defined in: [agent-pay/src/sprint2/revocation.ts:70](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L70)

Which layer detected revocation (1 | 2 | 3), if applicable.

***

### reason?

> `optional` **reason?**: `string`

Defined in: [agent-pay/src/sprint2/revocation.ts:72](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L72)

Human-readable reason string (for logging).

***

### revokedAt?

> `optional` **revokedAt?**: `string`

Defined in: [agent-pay/src/sprint2/revocation.ts:74](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L74)

ISO timestamp of when the revocation was recorded, if available.

***

### status

> **status**: [`RevocationStatusCode`](../type-aliases/RevocationStatusCode.md)

Defined in: [agent-pay/src/sprint2/revocation.ts:68](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L68)

Composite status code.

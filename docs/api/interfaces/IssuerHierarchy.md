[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / IssuerHierarchy

# Interface: IssuerHierarchy

Defined in: [agent-pay/src/sprint2/issuer.ts:151](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L151)

Full issuer hierarchy: root + active spend keys + agent subkeys.
Serialized and stored in the hosted issuer service database.

## Properties

### agentSubkeys

> **agentSubkeys**: [`AgentSubkeyRecord`](AgentSubkeyRecord.md)[]

Defined in: [agent-pay/src/sprint2/issuer.ts:159](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L159)

All agent subkey records.

***

### currentEpoch

> **currentEpoch**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:161](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L161)

Current issuer epoch (matches on-chain value).

***

### issuerAddress

> **issuerAddress**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:153](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L153)

PQSafe issuer address (derived from root key).

***

### lastEpochAdvancedAt?

> `optional` **lastEpochAdvancedAt?**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:163](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L163)

ISO timestamp of last epoch advance.

***

### rootKey

> **rootKey**: [`RootKeyRecord`](RootKeyRecord.md)

Defined in: [agent-pay/src/sprint2/issuer.ts:155](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L155)

Root key record (secret never stored here — public key + metadata only).

***

### spendKeys

> **spendKeys**: [`SpendKeyRecord`](SpendKeyRecord.md)[]

Defined in: [agent-pay/src/sprint2/issuer.ts:157](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L157)

All spend key records (active + historical).

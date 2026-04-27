[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / assertPolicyConsistency

# Function: assertPolicyConsistency()

> **assertPolicyConsistency**(`policy`, `maxAmount`): `void`

Defined in: [agent-pay/src/sprint2/policy.ts:157](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L157)

Cross-field validation: verify that perTxLimit does not exceed maxAmount.
Call this after parsing both envelope + policy.

## Parameters

### policy

\{ `mode`: `"single_use"`; \} \| \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \} \| \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}

#### Type Literal

\{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}

##### mode

`"per_tx_cap"` = `...`

##### perTxLimit

`number` = `...`

Maximum amount per individual payment (same currency as envelope.currency).
Must be <= envelope.maxAmount.

***

#### Type Literal

\{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}

##### mode

`"cumulative_cap"` = `...`

##### resetWindowSeconds?

`number` = `...`

Optional: reset window in seconds. If set, the cumulative counter resets
every `resetWindowSeconds`. Enables weekly/monthly budget envelopes.
If omitted, the cap is lifetime (no reset).

### maxAmount

`number`

## Returns

`void`

## Throws

if the policy is logically inconsistent with the envelope's maxAmount.

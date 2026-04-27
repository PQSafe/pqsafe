[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / validateSpendPolicy

# Function: validateSpendPolicy()

> **validateSpendPolicy**(`raw`): \{ `mode`: `"single_use"`; \} \| \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \} \| \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}

Defined in: [agent-pay/src/sprint2/policy.ts:139](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L139)

Validate a SpendPolicy object. Throws if the policy is structurally invalid.
Used by the hosted issuer API to validate caller-supplied policies.

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `mode`: `"single_use"`; \}

***

### Type Literal

\{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}

#### mode

> **mode**: `"per_tx_cap"`

#### perTxLimit

> **perTxLimit**: `number`

Maximum amount per individual payment (same currency as envelope.currency).
Must be <= envelope.maxAmount.

***

### Type Literal

\{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}

#### mode

> **mode**: `"cumulative_cap"`

#### resetWindowSeconds?

> `optional` **resetWindowSeconds?**: `number`

Optional: reset window in seconds. If set, the cumulative counter resets
every `resetWindowSeconds`. Enables weekly/monthly budget envelopes.
If omitted, the cap is lifetime (no reset).

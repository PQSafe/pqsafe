[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / submitToLedger

# Function: submitToLedger()

> **submitToLedger**(`record`): `Promise`\<`boolean`\>

Defined in: [agent-pay/src/ledger.ts:119](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/ledger.ts#L119)

Submit an anonymized payment record to the PQSafe ledger.

Best-effort: never throws. Failures are logged to console.debug only.
Returns true if submitted successfully, false otherwise.

## Parameters

### record

[`LedgerRecord`](../interfaces/LedgerRecord.md)

## Returns

`Promise`\<`boolean`\>

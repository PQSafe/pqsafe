[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / recommendedTTL

# Function: recommendedTTL()

> **recommendedTTL**(`amount`, `currency`): [`TTLPolicy`](../interfaces/TTLPolicy.md)

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:56](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L56)

Return the recommended TTL policy for a payment of the given amount.

## Parameters

### amount

`bigint`

Payment amount in the specified currency (bigint in minor units
                 if currency has decimals, or regular number via overload)

### currency

`string`

ISO 4217 currency code (e.g. 'USD', 'HKD', 'USDC').
                 Only USD / USDC are directly used for tier comparison.
                 All other currencies are treated at face value (i.e. the
                 `amount` is assumed to be already in USD-equivalent units).

Note: `amount` is expressed as a plain number representing the dollar (or
equivalent) value.  Use `Number(amount)` when calling with a bigint.

## Returns

[`TTLPolicy`](../interfaces/TTLPolicy.md)

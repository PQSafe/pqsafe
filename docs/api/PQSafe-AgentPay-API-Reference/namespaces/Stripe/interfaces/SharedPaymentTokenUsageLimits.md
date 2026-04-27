[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [Stripe](../README.md) / SharedPaymentTokenUsageLimits

# Interface: SharedPaymentTokenUsageLimits

Defined in: [agent-pay/src/adapters/acp.ts:39](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L39)

Usage limits applied to a Shared Payment Token.

All monetary fields are in the smallest currency unit (e.g. cents for USD).
This matches Stripe's convention for atomic currency amounts.

## Properties

### allowedCountries?

> `optional` **allowedCountries?**: `string`[]

Defined in: [agent-pay/src/adapters/acp.ts:82](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L82)

Allowed countries for merchant presence (ISO 3166-1 alpha-2).
Omit for all countries.

#### Example

```ts
["US", "GB", "HK"]
```

***

### allowedMerchantCategories?

> `optional` **allowedMerchantCategories?**: `string`[]

Defined in: [agent-pay/src/adapters/acp.ts:56](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L56)

Allowed merchant category codes (ISO 18245 MCCs).
Empty array or omitted = all merchants allowed.

#### Example

```ts
["5411", "5912"] — grocery stores and drug stores only
```

***

### allowedMerchants?

> `optional` **allowedMerchants?**: `string`[]

Defined in: [agent-pay/src/adapters/acp.ts:61](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L61)

Explicit allowlist of Stripe merchant IDs (acct_*) that may charge
this token. If set, charges from other merchants are rejected.

***

### blockedMerchants?

> `optional` **blockedMerchants?**: `string`[]

Defined in: [agent-pay/src/adapters/acp.ts:66](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L66)

Explicit blocklist of Stripe merchant IDs that may NOT charge this token.
Useful for excluding known high-risk merchants without blocking the category.

***

### currency?

> `optional` **currency?**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:87](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L87)

ISO 4217 currency code for usage limit amounts.
Required when any monetary limit is set.

***

### expiresAt?

> `optional` **expiresAt?**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:76](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L76)

ISO 8601 datetime after which the token is expired and cannot be used.

#### Example

```ts
"2026-06-01T00:00:00Z"
```

***

### maxAmountPerTransaction?

> `optional` **maxAmountPerTransaction?**: `number`

Defined in: [agent-pay/src/adapters/acp.ts:50](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L50)

Maximum amount per individual transaction, in the smallest currency unit.

#### Example

```ts
2000 — $20.00 per transaction
```

***

### maxTotalAmount?

> `optional` **maxTotalAmount?**: `number`

Defined in: [agent-pay/src/adapters/acp.ts:45](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L45)

Maximum total amount the token may authorize across all transactions,
in the smallest currency unit.

#### Example

```ts
10000 — $100.00 USD lifetime ceiling
```

***

### maxUseCount?

> `optional` **maxUseCount?**: `number`

Defined in: [agent-pay/src/adapters/acp.ts:71](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L71)

Maximum number of times the token may be used.
Omit for unlimited usage within other constraints.

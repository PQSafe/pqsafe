[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / PQSafeErrorParams

# Interface: PQSafeErrorParams

Defined in: [agent-pay/src/sprint2/errors.ts:177](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L177)

## Properties

### cause?

> `optional` **cause?**: `Error`

Defined in: [agent-pay/src/sprint2/errors.ts:199](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L199)

Optional: the underlying cause (for error chaining).

***

### code

> **code**: [`PQSafeErrorCode`](../type-aliases/PQSafeErrorCode.md)

Defined in: [agent-pay/src/sprint2/errors.ts:179](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L179)

Fine-grained error code.

***

### context?

> `optional` **context?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/sprint2/errors.ts:189](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L189)

Structured context for programmatic inspection (amounts, addresses, etc.).
All values must be JSON-serializable.

***

### human\_reason

> **human\_reason**: `string`

Defined in: [agent-pay/src/sprint2/errors.ts:184](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L184)

Human-readable explanation safe for logging and operator dashboards.
Do NOT include PII or secret key material here.

***

### retry\_after\_ms?

> `optional` **retry\_after\_ms?**: `number`

Defined in: [agent-pay/src/sprint2/errors.ts:195](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L195)

If retriable, how long the caller should wait before retrying (milliseconds).
Provided for RATE_LIMIT errors (parsed from Retry-After header).
For other retriable errors, use exponential backoff with this as the floor.

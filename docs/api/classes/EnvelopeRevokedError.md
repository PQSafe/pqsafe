[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / EnvelopeRevokedError

# Class: EnvelopeRevokedError

Defined in: [agent-pay/src/sprint2/errors.ts:390](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L390)

Thrown when a per-envelope revocation record exists (Layer 3).
The envelope has been explicitly revoked; never retriable.

## Extends

- [`RevocationError`](RevocationError.md)

## Constructors

### Constructor

> **new EnvelopeRevokedError**(`params`): `EnvelopeRevokedError`

Defined in: [agent-pay/src/sprint2/errors.ts:394](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L394)

#### Parameters

##### params

[`EnvelopeRevokedErrorParams`](../interfaces/EnvelopeRevokedErrorParams.md)

#### Returns

`EnvelopeRevokedError`

#### Overrides

[`RevocationError`](RevocationError.md).[`constructor`](RevocationError.md#constructor)

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

#### Inherited from

[`RevocationError`](RevocationError.md).[`cause`](RevocationError.md#cause)

***

### code

> `readonly` **code**: [`PQSafeErrorCode`](../type-aliases/PQSafeErrorCode.md)

Defined in: [agent-pay/src/sprint2/errors.ts:231](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L231)

Fine-grained stable error code. Safe for programmatic matching.

#### Inherited from

[`RevocationError`](RevocationError.md).[`code`](RevocationError.md#code)

***

### context

> `readonly` **context**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/sprint2/errors.ts:239](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L239)

Structured context for inspection.

#### Inherited from

[`RevocationError`](RevocationError.md).[`context`](RevocationError.md#context)

***

### envelopeHash

> `readonly` **envelopeHash**: `string`

Defined in: [agent-pay/src/sprint2/errors.ts:391](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L391)

***

### error\_class

> `readonly` **error\_class**: [`ErrorClass`](../type-aliases/ErrorClass.md)

Defined in: [agent-pay/src/sprint2/errors.ts:229](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L229)

Broad category of error. Use for routing and alerting.

#### Inherited from

[`RevocationError`](RevocationError.md).[`error_class`](RevocationError.md#error_class)

***

### human\_reason

> `readonly` **human\_reason**: `string`

Defined in: [agent-pay/src/sprint2/errors.ts:237](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L237)

Operator-readable explanation.

#### Inherited from

[`RevocationError`](RevocationError.md).[`human_reason`](RevocationError.md#human_reason)

***

### is\_retriable

> `readonly` **is\_retriable**: `boolean`

Defined in: [agent-pay/src/sprint2/errors.ts:233](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L233)

Whether the same call may succeed if retried (after delay or new envelope).

#### Inherited from

[`RevocationError`](RevocationError.md).[`is_retriable`](RevocationError.md#is_retriable)

***

### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

[`RevocationError`](RevocationError.md).[`message`](RevocationError.md#message)

***

### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RevocationError`](RevocationError.md).[`name`](RevocationError.md#name)

***

### retry\_after\_ms

> `readonly` **retry\_after\_ms**: `number` \| `undefined`

Defined in: [agent-pay/src/sprint2/errors.ts:235](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L235)

Minimum wait before retry (ms). Undefined if not retriable.

#### Inherited from

[`RevocationError`](RevocationError.md).[`retry_after_ms`](RevocationError.md#retry_after_ms)

***

### revokedAt

> `readonly` **revokedAt**: `string` \| `undefined`

Defined in: [agent-pay/src/sprint2/errors.ts:392](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L392)

***

### stack?

> `optional` **stack?**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

#### Inherited from

[`RevocationError`](RevocationError.md).[`stack`](RevocationError.md#stack)

***

### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

#### Inherited from

[`RevocationError`](RevocationError.md).[`stackTraceLimit`](RevocationError.md#stacktracelimit)

## Methods

### toJSON()

> **toJSON**(): `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/sprint2/errors.ts:255](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L255)

Serialize to a JSON-safe object (for API responses and structured logging).

#### Returns

`Record`\<`string`, `unknown`\>

#### Inherited from

[`RevocationError`](RevocationError.md).[`toJSON`](RevocationError.md#tojson)

***

### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack;  // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

#### Parameters

##### targetObject

`object`

##### constructorOpt?

`Function`

#### Returns

`void`

#### Inherited from

[`RevocationError`](RevocationError.md).[`captureStackTrace`](RevocationError.md#capturestacktrace)

***

### prepareStackTrace()

> `static` **prepareStackTrace**(`err`, `stackTraces`): `any`

Defined in: node\_modules/@types/node/globals.d.ts:55

#### Parameters

##### err

`Error`

##### stackTraces

`CallSite`[]

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

[`RevocationError`](RevocationError.md).[`prepareStackTrace`](RevocationError.md#preparestacktrace)

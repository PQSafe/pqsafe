[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / canonicalJsonBytes

# Function: canonicalJsonBytes()

> **canonicalJsonBytes**(`value`): `Uint8Array`

Defined in: [agent-pay/src/canonical.ts:40](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/canonical.ts#L40)

Serialize `value` to RFC 8785 canonical JSON and return UTF-8 encoded bytes.

This is the primary function used for signing: the bytes returned here are
what ML-DSA-65 signs over. Any change to the value (including key order or
whitespace) will produce different bytes and invalidate the signature.

## Parameters

### value

`unknown`

Any JSON-serializable value. `undefined` at the top level
  will throw because it is not a valid JSON value.

## Returns

`Uint8Array`

A `Uint8Array` containing the UTF-8 bytes of the canonical JSON string.

## Throws

If `value` is `undefined`, contains `NaN`, `Infinity`, or
  a circular reference — all of which are not representable in JSON.

## Example

```ts
const bytes = canonicalJsonBytes({ b: 2, a: 1 })
// bytes encodes: {"a":1,"b":2}
```

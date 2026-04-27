[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / canonicalJsonString

# Function: canonicalJsonString()

> **canonicalJsonString**(`value`): `string`

Defined in: [agent-pay/src/canonical.ts:72](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/canonical.ts#L72)

Serialize `value` to an RFC 8785 canonical JSON string (debug / logging variant).

Prefer `canonicalJsonBytes` for signing. Use this only for logging or
human-readable output.

## Parameters

### value

`unknown`

Any JSON-serializable value.

## Returns

`string`

The canonical JSON string with keys sorted by UTF-16 code unit order.

## Throws

Same conditions as `canonicalJsonBytes`.

## Example

```ts
console.log(canonicalJsonString({ z: 3, a: 1 }))
// → {"a":1,"z":3}
```

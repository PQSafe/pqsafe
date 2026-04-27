[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / verifyAp2WithPqWrapper

# Function: verifyAp2WithPqWrapper()

> **verifyAp2WithPqWrapper**(`mandate`, `pqSig`, `pqPublicKey`): [`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

Defined in: [agent-pay/src/adapters/ap2.ts:561](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L561)

Verify an AP2 mandate that has been extended with PQSafe's post-quantum
signature wrapper (`mandate.pqSignature` / `mandate.pqPublicKey` extension fields).

Verification steps:
  1. Serialize the mandate to RFC 8785 canonical JSON bytes.
  2. Verify the ML-DSA-65 signature in `pqSig` over those bytes using `pqPublicKey`.
  3. Return the mandate typed as `AP2.AnyMandate` if verification succeeds.

This function is intentionally separate from `verifyEnvelope` — it operates
on raw AP2 mandate objects rather than on the `SpendEnvelope` wrapper, enabling
merchants who receive AP2 payloads to verify PQ integrity without understanding
the SpendEnvelope schema.

## Parameters

### mandate

[`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

The AP2 mandate received from the agent (any type).

### pqSig

`string`

Hex-encoded ML-DSA-65 signature (produced by PQSafe wallet).

### pqPublicKey

`string`

Hex-encoded ML-DSA-65 public key of the issuer.

## Returns

[`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

The verified `AP2.AnyMandate` (same object, typed).

## Throws

If signature verification fails (wrong key, tampered mandate).

## Throws

If signature size is not exactly 3309 bytes.

## Throws

If public key size is not exactly 1952 bytes.

## Throws

If mandate type is not one of 'intent', 'cart', 'payment'.

## Example

```ts
const verified = verifyAp2WithPqWrapper(mandate, sig, pubKey)
console.log('Mandate verified:', verified.mandateId)
```

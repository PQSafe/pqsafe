[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / extractSigFingerprint

# Function: extractSigFingerprint()

> **extractSigFingerprint**(`signedEnvelope`): `string`

Defined in: [agent-pay/src/arbitrum.ts:105](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L105)

Extract the signature fingerprint: first 32 bytes of the ML-DSA-65 signature.
The signature is hex-encoded in SignedEnvelope.signature.

## Parameters

### signedEnvelope

[`SignedEnvelope`](../interfaces/SignedEnvelope.md)

## Returns

`string`

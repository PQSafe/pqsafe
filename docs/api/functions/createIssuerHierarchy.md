[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / createIssuerHierarchy

# Function: createIssuerHierarchy()

> **createIssuerHierarchy**(`_params`): `Promise`\<[`IssuerHierarchy`](../interfaces/IssuerHierarchy.md)\>

Defined in: [agent-pay/src/sprint2/issuer.ts:184](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L184)

Create a new issuer hierarchy with a fresh root key.

Sprint 3 implementation will:
  1. Generate ML-DSA-87 root key (in HSM or software-dev-only mode).
  2. Derive issuer address from root public key.
  3. Generate first spend key (ML-DSA-65) + sign with root → certificate.
  4. Store hierarchy in hosted issuer service.
  5. Optionally register issuer address on Arbitrum registry.

## Parameters

### \_params

#### apiKey

`string`

#### hsmProvider

`"yubikey"` \| `"aws-cloudhsm"` \| `"google-cloud-kms"` \| `"software-dev-only"`

#### organizationName

`string`

#### serviceUrl

`string`

## Returns

`Promise`\<[`IssuerHierarchy`](../interfaces/IssuerHierarchy.md)\>

## Throws

'Sprint 2 — implementation queued' until Sprint 3 ships.

// PQSafe AgentPay — Subgraph Mappings
// SpendEnvelopeRegistryV2_1 | Arbitrum Sepolia
//
// Generated event handler stubs. Run `graph codegen` to regenerate types
// after updating schema.graphql or subgraph.yaml.

import {
  Address,
  BigInt,
  Bytes,
  log,
} from "@graphprotocol/graph-ts"

import {
  EnvelopeCommitted,
  EnvelopeUsed,
  EnvelopeRevoked,
  CumulativeSpendRecorded,
  IssuerEpochAdvanced,
  Paused,
  Unpaused,
} from "../generated/SpendEnvelopeRegistryV2_1/SpendEnvelopeRegistryV2_1"

import {
  Envelope,
  EnvelopeRevocation,
  IssuerEpoch,
  PauseEvent,
  CumulativeSpend,
} from "../generated/schema"

// ---------------------------------------------------------------------------
// EnvelopeCommitted
// ---------------------------------------------------------------------------

export function handleEnvelopeCommitted(event: EnvelopeCommitted): void {
  let id = event.params.envelopeId.toHexString()
  let envelope = new Envelope(id)

  envelope.issuer             = event.params.issuer
  envelope.operator           = event.params.operator
  envelope.sigFingerprint     = event.params.sigFingerprint
  envelope.maxAmount          = BigInt.fromI32(0) // encoded as uint128 — cast via event.params.maxAmount
  envelope.currency           = event.params.currency.toString()
  envelope.validUntil         = BigInt.fromI64(event.params.validUntil)
  envelope.nonce              = event.params.nonce
  envelope.issuerEpochAtCommit = BigInt.fromI64(event.params.issuerEpochAtCommit)
  envelope.chainId            = event.params.chainId
  envelope.status             = "PENDING"
  envelope.committedAt        = event.block.timestamp
  envelope.commitTxHash       = event.transaction.hash
  envelope.spentAmount        = BigInt.fromI32(0)

  // uint128 maxAmount requires explicit cast from event
  // graph-ts does not have a fromU128 — safe because amount < 2^128
  envelope.maxAmount = event.params.maxAmount

  envelope.save()

  log.info("EnvelopeCommitted: {} issuer={}", [id, event.params.issuer.toHexString()])
}

// ---------------------------------------------------------------------------
// EnvelopeUsed
// ---------------------------------------------------------------------------

export function handleEnvelopeUsed(event: EnvelopeUsed): void {
  let id = event.params.envelopeId.toHexString()
  let envelope = Envelope.load(id)
  if (envelope == null) {
    log.error("EnvelopeUsed: envelope {} not found in store", [id])
    return
  }

  envelope.status      = "USED"
  envelope.usedBy      = event.params.operator
  envelope.txReference = event.params.txReference
  envelope.amountUsed  = event.params.amountUsed
  envelope.usedAt      = event.block.timestamp

  envelope.save()
}

// ---------------------------------------------------------------------------
// EnvelopeRevoked
// ---------------------------------------------------------------------------

export function handleEnvelopeRevoked(event: EnvelopeRevoked): void {
  let id = event.params.envelopeId.toHexString()
  let envelope = Envelope.load(id)
  if (envelope == null) {
    log.error("EnvelopeRevoked: envelope {} not found in store", [id])
    return
  }

  envelope.status = "REVOKED"
  envelope.save()

  let revId = id
  let rev = new EnvelopeRevocation(revId)
  rev.envelope    = id
  rev.revokedBy   = event.params.revokedBy
  rev.revokedAt   = event.block.timestamp
  rev.reasonHash  = event.params.reasonHash
  rev.txHash      = event.transaction.hash
  rev.save()
}

// ---------------------------------------------------------------------------
// CumulativeSpendRecorded
// ---------------------------------------------------------------------------

export function handleCumulativeSpendRecorded(event: CumulativeSpendRecorded): void {
  let envId = event.params.envelopeId.toHexString()
  let envelope = Envelope.load(envId)
  if (envelope == null) {
    log.error("CumulativeSpendRecorded: envelope {} not found", [envId])
    return
  }

  envelope.spentAmount = event.params.runningTotal
  envelope.save()

  // Store individual draw for analytics
  let drawId = envId + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let draw = new CumulativeSpend(drawId)
  draw.envelope        = envId
  draw.incrementAmount = event.params.incrementAmount
  draw.runningTotal    = event.params.runningTotal
  draw.blockTimestamp  = event.block.timestamp
  draw.txHash          = event.transaction.hash
  draw.save()
}

// ---------------------------------------------------------------------------
// IssuerEpochAdvanced
// ---------------------------------------------------------------------------

export function handleIssuerEpochAdvanced(event: IssuerEpochAdvanced): void {
  let issuerId = event.params.issuer.toHexString()
  let epoch = IssuerEpoch.load(issuerId)
  if (epoch == null) {
    epoch = new IssuerEpoch(issuerId)
    epoch.issuer = event.params.issuer
  }

  epoch.currentEpoch   = BigInt.fromI64(event.params.newEpoch)
  epoch.lastAdvancedAt = event.block.timestamp
  epoch.txHash         = event.transaction.hash
  epoch.save()
}

// ---------------------------------------------------------------------------
// Paused / Unpaused
// ---------------------------------------------------------------------------

export function handlePaused(event: Paused): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let pe = new PauseEvent(id)
  pe.event          = "PAUSED"
  pe.actor          = event.params.account
  pe.blockTimestamp = event.block.timestamp
  pe.txHash         = event.transaction.hash
  pe.save()

  log.info("Contract PAUSED by {}", [event.params.account.toHexString()])
}

export function handleUnpaused(event: Unpaused): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let pe = new PauseEvent(id)
  pe.event          = "UNPAUSED"
  pe.actor          = event.params.account
  pe.blockTimestamp = event.block.timestamp
  pe.txHash         = event.transaction.hash
  pe.save()

  log.info("Contract UNPAUSED by {}", [event.params.account.toHexString()])
}

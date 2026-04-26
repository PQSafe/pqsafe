"""
PQSafe AgentPay — Sprint 2: 3-layer revocation type definitions + stubs.

IMPLEMENTATION STATUS: Types only. All functions raise NotImplementedError.
Full implementation is Sprint 3 (May 19 – Jun 8).

Architecture summary (see design doc §2 for full spec):

  Layer 1 — Short-lived envelopes (default 1h TTL)
    Reduces reliance on revocation for most use cases.
    Already enforced by Sprint 1 valid_until check.
    No additional infrastructure required.

  Layer 2 — Issuer epoch (on-chain, O(1) bulk invalidation)
    One uint64 per issuer address on Arbitrum registry.
    Envelope carries epoch it was signed under.
    Advancing epoch invalidates ALL envelopes from that issuer immediately.
    Cost: one on-chain write (~$0.001 on Arbitrum).
    Latency: ~2–4 block confirms (~2 sec Arbitrum, ~12 sec Ethereum).

  Layer 3 — Per-envelope registry (granular, expensive, used sparingly)
    On-chain bit flip per envelope_id.
    Use for high-value envelopes or targeted compromise response.
    Consumers check this only when envelope.max_amount > GRANULAR_REVOCATION_THRESHOLD.

Fail-safe policy (see composite table in design doc §2.4):
  - Amount < $100:  fail-open  (proceed if revocation service unreachable)
  - Amount $100–1K: fail-closed (block if revocation service unreachable after 500ms)
  - Amount > $1K:   fail-closed + require L3 check + optional 2-of-3 multi-sig

Mirrors TypeScript SDK ``src/sprint2/revocation.ts``.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

IssuerEpoch = int
"""Epoch number for Layer 2 bulk invalidation (uint64, represented as int)."""

_NOT_IMPL = "Sprint 2 — implementation queued (Sprint 3: May 19 – Jun 8)"


class RevocationCheckRequest(BaseModel):
    """
    A revocation check request. The verifier assembles this from the envelope
    and passes it to is_revoked().
    """

    issuer_address: str = Field(..., alias="issuerAddress")
    """PQSafe issuer address (pq1 + 40 hex)."""

    envelope_id: str = Field(..., alias="envelopeId")
    """keccak256(envelope_json) — the on-chain primary key."""

    envelope_epoch: IssuerEpoch = Field(..., alias="envelopeEpoch")
    """Epoch the envelope was signed under (carried in SpendEnvelope.issuer_epoch, Sprint 3+)."""

    requested_amount: float = Field(..., alias="requestedAmount")
    """Amount of the requested payment — drives fail-safe threshold selection."""

    currency: str
    """ISO 4217 currency."""

    model_config = {"populate_by_name": True}


class RevocationStatus(BaseModel):
    """Result of a revocation check."""

    revoked: bool
    """True = envelope is revoked and payment must be blocked."""

    layer: Optional[Literal[1, 2, 3]] = None
    """Which layer detected the revocation (or None if not revoked)."""

    reason: Optional[str] = None
    """Human-readable reason (for logging, not user-display)."""

    fail_open: Optional[bool] = Field(None, alias="failOpen")
    """True = check was skipped due to fail-open policy (low-value + service down)."""

    revoked_at: Optional[str] = Field(None, alias="revokedAt")
    """ISO timestamp of when the revocation was recorded (if available)."""

    model_config = {"populate_by_name": True}


class RevocationRecord(BaseModel):
    """Revocation record stored in the hosted issuer service."""

    envelope_id: str = Field(..., alias="envelopeId")
    issuer_address: str = Field(..., alias="issuerAddress")
    revoked_at: str = Field(..., alias="revokedAt")
    revoked_by: str = Field(..., alias="revokedBy")
    """API key or root key fingerprint."""
    reason: str
    layer: Literal[2, 3]

    model_config = {"populate_by_name": True}


class RevocationServiceConfig(BaseModel):
    """Config for connecting to the revocation check service."""

    service_url: str = Field(..., alias="serviceUrl")
    """Hosted issuer service base URL, e.g. https://api.pqsafe.xyz."""

    api_key: str = Field(..., alias="apiKey")
    """API key (pq_live_... or pq_test_...)."""

    timeout_ms: Optional[int] = Field(None, alias="timeoutMs")
    """Timeout in ms before applying fail-safe policy. Default 500ms."""

    fail_closed_threshold_usd: Optional[float] = Field(None, alias="failClosedThresholdUsd")
    """Amount threshold (in USD equivalent) above which fail-closed applies. Default $100."""

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Stub functions — Sprint 3 implementation queued
# ---------------------------------------------------------------------------


async def is_revoked(
    request: RevocationCheckRequest,
    config: RevocationServiceConfig,
) -> RevocationStatus:
    """
    Check whether a SpendEnvelope has been revoked via any of the 3 layers.

    Sprint 3 implementation will:
      1. Check Layer 2 (epoch): compare envelope.issuer_epoch against on-chain current epoch.
         Fast path — cached per-issuer, invalidated by epoch-change events.
      2. If amount >= config.fail_closed_threshold_usd, check Layer 3 (per-envelope registry).
      3. Apply fail-safe policy based on amount if the service is unreachable.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)


async def revoke(
    envelope_id: str,
    reason: str,
    config: RevocationServiceConfig,
) -> RevocationRecord:
    """
    Revoke a specific envelope (Layer 3 — granular per-envelope revocation).

    Sprint 3 implementation will:
      1. POST /v1/issuers/:id/revocations with envelope_id + reason.
      2. Hosted service writes revocation record to Postgres + triggers on-chain bit flip.
      3. Returns the revocation record with confirmation.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)


async def advance_epoch(
    issuer_address: str,
    config: RevocationServiceConfig,
) -> IssuerEpoch:
    """
    Advance the issuer epoch (Layer 2 — bulk invalidation).

    Advancing the epoch invalidates ALL envelopes signed under the current epoch
    for this issuer. Use in response to key compromise, agent misbehavior, or
    as a routine rotation event.

    Sprint 3 implementation will:
      1. POST /v1/issuers/:id/epoch/advance (requires root key or spend key auth).
      2. Hosted service atomically increments the epoch counter.
      3. Triggers on-chain epoch write to Arbitrum registry (audit anchor).
      4. All verifiers revalidating envelopes will see the new epoch and reject old ones.

    Returns
    -------
    IssuerEpoch
        The new epoch number.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)


async def get_epoch(
    issuer_address: str,
    config: "RevocationServiceConfig",
) -> IssuerEpoch:
    """
    Get the current epoch for an issuer address.

    Sprint 3 implementation will check:
      1. Cache (TTL 30s) — served from hosted issuer service.
      2. On cache miss: direct Arbitrum eth_call to the registry contract.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)

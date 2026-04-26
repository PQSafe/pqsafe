"""
PQSafe AgentPay — Sprint 2: Hierarchical Issuer + Key Rotation type definitions + stubs.

IMPLEMENTATION STATUS: Types only. All functions raise NotImplementedError.
Full implementation is Sprint 3 (May 19 – Jun 8).

Key hierarchy (see design doc §3 for full architecture):

  Root Key (HSM-backed in prod)
  └── Spend Key 1 (quarterly rotation, signed by root)
      └── Agent Subkey A  (agent-scoped, bounded authority)
      └── Agent Subkey B
  └── Spend Key 2 (next rotation, pre-generated)
      └── ...

Key types:
  - Root key: ML-DSA-87 (highest security, FIPS 204 Level 5). Never touches
    the network. Signs spend key certificates only. HSM-backed in prod;
    YubiKey or cloud HSM acceptable for v1.
  - Spend key: ML-DSA-65 (FIPS 204 Level 3). Rotated quarterly. Signs
    individual envelopes. Can be revoked by root key by advancing issuer epoch.
  - Agent subkey: ML-DSA-44 (FIPS 204 Level 2). Scoped to a single agent
    identity. Bounded: cannot sign envelopes above agent_max_amount or for
    issuers not in agent_allowed_issuers. Derived from spend key.

Multi-sig:
  For envelopes above MULTISIG_THRESHOLD_USD ($1,000 USD default), require
  signatures from 2-of-3 spend keys.

Mirrors TypeScript SDK ``src/sprint2/issuer.ts``.
"""

from __future__ import annotations

from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MULTISIG_THRESHOLD_USD: float = 1_000.0
"""Default threshold above which 2-of-3 multi-sig is required (USD)."""

SPEND_KEY_ROTATION_INTERVAL_SEC: int = 90 * 24 * 60 * 60
"""Default spend key rotation interval in seconds (90 days)."""

_NOT_IMPL = "Sprint 2 — implementation queued (Sprint 3: May 19 – Jun 8)"

# ---------------------------------------------------------------------------
# Key type alias
# ---------------------------------------------------------------------------

MLDSAVariant = Literal["ml-dsa-44", "ml-dsa-65", "ml-dsa-87"]
"""ML-DSA parameter set — drives security level and signature size."""

# ---------------------------------------------------------------------------
# Key record models
# ---------------------------------------------------------------------------


class KeyRecord(BaseModel):
    """Common fields shared by all key records."""

    key_id: str = Field(..., alias="keyId")
    """Unique key ID (UUID v4). Used in certificates and audit logs."""

    variant: MLDSAVariant
    """ML-DSA variant for this key."""

    public_key: str = Field(..., alias="publicKey")
    """Hex-encoded public key bytes."""

    created_at: str = Field(..., alias="createdAt")
    """ISO timestamp: when this key was generated."""

    valid_from: str = Field(..., alias="validFrom")
    """ISO timestamp: not valid before this time."""

    valid_until: str = Field(..., alias="validUntil")
    """ISO timestamp: not valid after this time."""

    revoked: bool = False
    """Whether this key has been explicitly revoked (epoch advance or root revocation)."""

    revoked_at: Optional[str] = Field(None, alias="revokedAt")
    """ISO timestamp of revocation (if revoked = True)."""

    model_config = {"populate_by_name": True}


class RootKeyRecord(KeyRecord):
    """
    Root key record. The secret key never leaves the HSM.
    Only the public key and metadata are stored in this record.
    """

    type: Literal["root"] = "root"
    variant: Literal["ml-dsa-87"] = "ml-dsa-87"

    issuer_address: str = Field(..., alias="issuerAddress")
    """PQSafe issuer address derived from this root key (pq1 + keccak256(publicKey)[0:20])."""

    hsm_provider: Literal[
        "yubikey", "aws-cloudhsm", "google-cloud-kms", "software-dev-only"
    ] = Field(..., alias="hsmProvider")
    """HSM provider used in production."""

    model_config = {"populate_by_name": True}


class SpendKeyCertificate(BaseModel):
    """
    Spend key certificate: issued by root key to a spend key.
    Carried in the envelope's key_chain field (Sprint 3+).
    Allows a verifier to check: root_key → spend_key → envelope.
    """

    spend_key_id: str = Field(..., alias="spendKeyId")
    spend_key_public_key: str = Field(..., alias="spendKeyPublicKey")
    root_signature: str = Field(..., alias="rootSignature")
    """ML-DSA-87 signature by the root key over the canonical cert payload."""
    root_key_id: str = Field(..., alias="rootKeyId")
    root_public_key: str = Field(..., alias="rootPublicKey")
    issued_at: str = Field(..., alias="issuedAt")
    valid_until: str = Field(..., alias="validUntil")
    epoch: str
    """Epoch this spend key was issued under. Must match the issuer's current epoch."""

    model_config = {"populate_by_name": True}


class SpendKeyRecord(KeyRecord):
    """Spend key record: rotated quarterly, signs individual envelopes."""

    type: Literal["spend"] = "spend"
    variant: Literal["ml-dsa-65"] = "ml-dsa-65"

    certificate: SpendKeyCertificate
    """Certificate from root key authorizing this spend key."""

    rotation_quarter: str = Field(..., alias="rotationQuarter")
    """Quarter this key is active (e.g. '2026-Q2'). For human reference only."""

    model_config = {"populate_by_name": True}


class AgentSubkeyRecord(KeyRecord):
    """Agent subkey record: scoped to a single agent identity."""

    type: Literal["agent"] = "agent"
    variant: Literal["ml-dsa-44"] = "ml-dsa-44"

    agent_id: str = Field(..., alias="agentId")
    """Agent identifier this subkey is scoped to."""

    parent_spend_key_id: str = Field(..., alias="parentSpendKeyId")
    """Parent spend key ID that derived this subkey."""

    agent_max_amount: float = Field(..., alias="agentMaxAmount")
    """
    Maximum amount this subkey can authorize per envelope.
    Enforced by the hosted issuer service during envelope creation.
    Verifiers MUST reject envelopes where amount > agent_max_amount for agent subkeys.
    """

    agent_allowed_currencies: List[str] = Field(default_factory=list, alias="agentAllowedCurrencies")
    """ISO 4217 currencies this subkey is permitted to sign. Empty = all currencies."""

    agent_allowed_rails: List[str] = Field(default_factory=list, alias="agentAllowedRails")
    """Rails this subkey is permitted to sign. Empty = all rails."""

    model_config = {"populate_by_name": True}


AnyKeyRecord = Union[RootKeyRecord, SpendKeyRecord, AgentSubkeyRecord]
"""Union of all key record types."""


class IssuerHierarchy(BaseModel):
    """
    Full issuer hierarchy: root + active spend keys + agent subkeys.
    Serialized and stored in the hosted issuer service database.
    """

    issuer_address: str = Field(..., alias="issuerAddress")
    """PQSafe issuer address (derived from root key)."""

    root_key: RootKeyRecord = Field(..., alias="rootKey")
    """Root key record (secret never stored here — public key + metadata only)."""

    spend_keys: List[SpendKeyRecord] = Field(default_factory=list, alias="spendKeys")
    """All spend key records (active + historical)."""

    agent_subkeys: List[AgentSubkeyRecord] = Field(default_factory=list, alias="agentSubkeys")
    """All agent subkey records."""

    current_epoch: str = Field(..., alias="currentEpoch")
    """Current issuer epoch (matches on-chain value). uint64 as decimal string."""

    last_epoch_advanced_at: Optional[str] = Field(None, alias="lastEpochAdvancedAt")
    """ISO timestamp of last epoch advance."""

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Stub functions — Sprint 3 implementation queued
# ---------------------------------------------------------------------------


async def create_issuer_hierarchy(
    *,
    hsm_provider: Literal["yubikey", "aws-cloudhsm", "google-cloud-kms", "software-dev-only"],
    organization_name: str,
    api_key: str,
    service_url: str,
) -> IssuerHierarchy:
    """
    Create a new issuer hierarchy with a fresh root key.

    Sprint 3 implementation will:
      1. Generate ML-DSA-87 root key (in HSM or software-dev-only mode).
      2. Derive issuer address from root public key.
      3. Generate first spend key (ML-DSA-65) + sign with root → certificate.
      4. Store hierarchy in hosted issuer service.
      5. Optionally register issuer address on Arbitrum registry.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)


async def rotate_spend_key(
    issuer_address: str,
    *,
    service_url: str,
    api_key: str,
) -> SpendKeyRecord:
    """
    Rotate the active spend key (advance to next quarterly key).

    Sprint 3 implementation will:
      1. Generate new ML-DSA-65 spend key.
      2. Sign new spend key certificate with root key (requires HSM interaction).
      3. Advance issuer epoch on-chain (invalidates all envelopes from old epoch).
      4. Old spend key remains in hierarchy for historical verification.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)


async def create_agent_subkey(
    issuer_address: str,
    *,
    agent_id: str,
    agent_max_amount: float,
    agent_allowed_currencies: Optional[List[str]] = None,
    agent_allowed_rails: Optional[List[str]] = None,
    ttl_seconds: Optional[int] = None,
    service_url: str,
    api_key: str,
) -> AgentSubkeyRecord:
    """
    Create a new agent-scoped subkey with bounded authority.

    Sprint 3 implementation will:
      1. Generate ML-DSA-44 agent subkey.
      2. Associate with active spend key + agent identity.
      3. Enforce agent_max_amount <= spend_key's effective limit.
      4. Register subkey in hosted issuer service.

    Raises
    ------
    NotImplementedError
        Always — Sprint 3 implementation pending.
    """
    raise NotImplementedError(_NOT_IMPL)

"""
PQSafe AgentPay — Sprint 2 modules.

Provides spend policy types, revocation stubs, and issuer hierarchy types.

IMPLEMENTATION STATUS: Types + policy validation implemented.
Revocation and issuer hierarchy functions are stubs — Sprint 3 (May 19 – Jun 8).
"""

from __future__ import annotations

from .policy import (
    SpendPolicyMode,
    SingleUsePolicy,
    PerTxCapPolicy,
    CumulativeCapPolicy,
    SpendPolicy,
    SpendEnvelopeExtV2,
    DEFAULT_SPEND_POLICY,
    validate_spend_policy,
    effective_policy,
    assert_policy_consistency,
)
from .revocation import (
    IssuerEpoch,
    RevocationCheckRequest,
    RevocationStatus,
    RevocationRecord,
    RevocationServiceConfig,
    is_revoked,
    revoke,
    advance_epoch,
    get_epoch,
)
from .issuer import (
    MULTISIG_THRESHOLD_USD,
    SPEND_KEY_ROTATION_INTERVAL_SEC,
    MLDSAVariant,
    KeyRecord,
    RootKeyRecord,
    SpendKeyCertificate,
    SpendKeyRecord,
    AgentSubkeyRecord,
    AnyKeyRecord,
    IssuerHierarchy,
    create_issuer_hierarchy,
    rotate_spend_key,
    create_agent_subkey,
)

__all__ = [
    # Policy
    "SpendPolicyMode",
    "SingleUsePolicy",
    "PerTxCapPolicy",
    "CumulativeCapPolicy",
    "SpendPolicy",
    "SpendEnvelopeExtV2",
    "DEFAULT_SPEND_POLICY",
    "validate_spend_policy",
    "effective_policy",
    "assert_policy_consistency",
    # Revocation
    "IssuerEpoch",
    "RevocationCheckRequest",
    "RevocationStatus",
    "RevocationRecord",
    "RevocationServiceConfig",
    "is_revoked",
    "revoke",
    "advance_epoch",
    "get_epoch",
    # Issuer hierarchy
    "MULTISIG_THRESHOLD_USD",
    "SPEND_KEY_ROTATION_INTERVAL_SEC",
    "MLDSAVariant",
    "KeyRecord",
    "RootKeyRecord",
    "SpendKeyCertificate",
    "SpendKeyRecord",
    "AgentSubkeyRecord",
    "AnyKeyRecord",
    "IssuerHierarchy",
    "create_issuer_hierarchy",
    "rotate_spend_key",
    "create_agent_subkey",
]

# Changelog

All notable changes to `pqsafe-agent-pay` are documented here.

## [0.1.1] — 2026-04-26

### Added

**AP2 adapter** (`src/pqsafe/adapters/ap2.py`):
- `ap2_mandate_to_spend_envelope(mandate, issuer_address, ttl_seconds)` — converts any AP2 mandate (IntentMandate, CartMandate, PaymentMandate) to a PQSafe SpendEnvelope. Handles ISO 8601 ↔ Unix conversion and nonce derivation via SHA-256 truncation.
- `spend_envelope_to_ap2_mandate(env, mandate_type)` — converts a SpendEnvelope back to an AP2 mandate of the requested type.
- `verify_ap2_with_pq_wrapper(mandate, pq_sig, pq_public_key)` — verifies an AP2 mandate's ML-DSA-65 PQSafe signature over RFC 8785 canonical JSON bytes.
- Pydantic v2 models: `PaymentItem`, `PaymentMethodData`, `ContactAddress`, `IntentMandate`, `CartMandate`, `PaymentMandate`.

**ACP adapter** (`src/pqsafe/adapters/acp.py`):
- `acp_token_to_spend_envelope(token, issuer_address, agent_id)` — converts a Stripe Shared Payment Token to a SpendEnvelope. Handles zero-decimal currency guard (JPY, KRW, etc.) — no division by 100 for those currencies.
- `spend_envelope_to_acp_token(env, payment_method_id)` — converts a SpendEnvelope to Stripe SPT creation params. Enforces single-merchant constraint.
- Pydantic v2 models: `SharedPaymentToken`, `SharedPaymentTokenUsageLimits`, `CreateSharedPaymentTokenParams`.

**Sprint 2 modules**:
- `src/pqsafe/sprint2/policy.py` — `SpendPolicyMode` enum, `SingleUsePolicy`, `PerTxCapPolicy`, `CumulativeCapPolicy` Pydantic schemas, `validate_spend_policy()`, `effective_policy()`, `assert_policy_consistency()`.
- `src/pqsafe/sprint2/revocation.py` — type definitions (`RevocationCheckRequest`, `RevocationStatus`, `RevocationRecord`, `RevocationServiceConfig`) + 4 stub functions raising `NotImplementedError` (Sprint 3: May 19 – Jun 8).
- `src/pqsafe/sprint2/issuer.py` — `IssuerHierarchy`, `RootKeyRecord`, `SpendKeyRecord`, `AgentSubkeyRecord`, `SpendKeyCertificate` types + 3 stub functions.

**Tests**:
- `tests/test_ap2_adapter.py` — 26 tests covering AP2/ACP adapters (mandate round-trips, PQ verify, currency conversion, guard rails).
- `tests/test_sprint2.py` — 29 tests covering policy validation, effective_policy, consistency checks, revocation stubs, issuer stubs, constants.
- `tests/integration/test_cross_sdk_interop.py` — 8 tests verifying Python canonical bytes match TypeScript SDK output (SHA-256 parity + ML-DSA-65 signature verification).

**Total test count**: 143 (80 baseline + 63 new). All pass.

### Changed

- `src/pqsafe/__init__.py` updated to export all adapter and Sprint 2 symbols.
- `README.md` updated with AP2 adapter, ACP adapter, and Sprint 2 policy sections.

## [0.1.0] — 2026-04-21

Initial release.

- ML-DSA-65 key generation, SpendEnvelope create/sign/verify.
- RFC 8785 canonical JSON (`canonical_json_bytes`, `canonical_json_string`).
- Structured error hierarchy (`PQSafeError` + 7 typed subclasses, 30 error codes).
- `pay()` convenience function with mock/dry_run mode.
- 80 tests passing.

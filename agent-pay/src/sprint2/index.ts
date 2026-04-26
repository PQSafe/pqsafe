/**
 * Sprint 2 scaffold — public API barrel.
 *
 * Exports all Sprint 2 type definitions, stubs, and the fully-implemented
 * PQSafeError hierarchy. Import from '@pqsafe/agent-pay/sprint2' (Sprint 2+)
 * or directly from '../sprint2/index.js' in internal code.
 */

// Spend policy types + validation helpers (no enforcement)
export * from './policy.js'

// 3-layer revocation types + stubs
export * from './revocation.js'

// Hierarchical issuer types + stubs
export * from './issuer.js'

// Structured error hierarchy (FULLY IMPLEMENTED)
export * from './errors.js'

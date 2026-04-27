/**
 * bench/fixtures/keypair.ts
 *
 * Pre-generated deterministic test keypair for benchmarks.
 * Uses a fixed seed so key generation does not inflate latency numbers.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

// Fixed 32-byte seed — NOT a real key, benchmark use only.
export const FIXTURE_SEED = new Uint8Array(32).fill(0xab)
export const FIXTURE_MSG = new TextEncoder().encode('pqsafe-bench-fixture-message-32b')

const { secretKey, publicKey } = ml_dsa65.keygen(FIXTURE_SEED)
export const FIXTURE_SECRET_KEY = secretKey
export const FIXTURE_PUBLIC_KEY = publicKey

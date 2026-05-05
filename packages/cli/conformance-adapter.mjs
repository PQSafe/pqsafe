/**
 * conformance-adapter.mjs — Verifier adapter for @pqsafe/conformance dogfood CI
 *
 * Wraps the @noble/post-quantum ML-DSA-65 verifier (the same library used by
 * @pqsafe/cli internally) into the Verifier interface expected by pqsafe-conformance.
 *
 * Used by: .github/workflows/conformance.yml (monorepo dogfood run)
 * License: Apache-2.0
 */

import { mlDsa65 } from '@noble/post-quantum/ml-dsa'

export default {
  /**
   * @param {{ publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array }} input
   * @returns {Promise<{ valid: boolean, reason?: string }>}
   */
  async verify({ publicKey, message, signature }) {
    try {
      const valid = mlDsa65.verify(publicKey, message, signature)
      return { valid }
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) }
    }
  },
}

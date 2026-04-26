/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) module.
 *
 * Uses the `canonicalize` npm package (v3+) which implements the exact key
 * ordering and serialization rules required by RFC 8785:
 *   - Object keys sorted by UTF-16 code unit order (same as ES `Array.sort`)
 *   - No extra whitespace
 *   - NaN / Infinity rejected (not valid JSON)
 *   - Circular references detected and rejected
 *   - Array element order preserved
 *
 * This replaces the previous `sortedJsonReplacer` which used `localeCompare`
 * (locale-sensitive, platform-dependent) and was NOT RFC 8785 compliant.
 *
 * @module canonical
 * @see https://www.rfc-editor.org/rfc/rfc8785
 */

import canonicalize from 'canonicalize'

/**
 * Serialize `value` to RFC 8785 canonical JSON and return UTF-8 encoded bytes.
 *
 * This is the primary function used for signing: the bytes returned here are
 * what ML-DSA-65 signs over. Any change to the value (including key order or
 * whitespace) will produce different bytes and invalidate the signature.
 *
 * @param value - Any JSON-serializable value. `undefined` at the top level
 *   will throw because it is not a valid JSON value.
 * @returns A `Uint8Array` containing the UTF-8 bytes of the canonical JSON string.
 * @throws {Error} If `value` is `undefined`, contains `NaN`, `Infinity`, or
 *   a circular reference — all of which are not representable in JSON.
 *
 * @example
 * ```ts
 * const bytes = canonicalJsonBytes({ b: 2, a: 1 })
 * // bytes encodes: {"a":1,"b":2}
 * ```
 */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  if (value === undefined) {
    throw new Error(
      'canonicalJsonBytes: cannot serialize undefined — undefined is not a valid JSON value',
    )
  }
  const json = canonicalize(value)
  if (json === undefined) {
    // canonicalize() returns undefined for symbol/function values
    throw new Error(
      'canonicalJsonBytes: value is not JSON-serializable (got symbol or function)',
    )
  }
  return new TextEncoder().encode(json)
}

/**
 * Serialize `value` to an RFC 8785 canonical JSON string (debug / logging variant).
 *
 * Prefer `canonicalJsonBytes` for signing. Use this only for logging or
 * human-readable output.
 *
 * @param value - Any JSON-serializable value.
 * @returns The canonical JSON string with keys sorted by UTF-16 code unit order.
 * @throws {Error} Same conditions as `canonicalJsonBytes`.
 *
 * @example
 * ```ts
 * console.log(canonicalJsonString({ z: 3, a: 1 }))
 * // → {"a":1,"z":3}
 * ```
 */
export function canonicalJsonString(value: unknown): string {
  if (value === undefined) {
    throw new Error(
      'canonicalJsonString: cannot serialize undefined — undefined is not a valid JSON value',
    )
  }
  const json = canonicalize(value)
  if (json === undefined) {
    throw new Error(
      'canonicalJsonString: value is not JSON-serializable (got symbol or function)',
    )
  }
  return json
}

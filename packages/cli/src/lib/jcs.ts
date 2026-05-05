/**
 * jcs.ts — JSON Canonicalization Scheme (RFC 8785)
 *
 * Produces a deterministic UTF-8 encoding of a JSON value by:
 *   1. Sorting object keys lexicographically (recursive)
 *   2. No whitespace
 *   3. Standard JSON scalar encoding
 *
 * This tiny implementation avoids pulling a heavy dependency and matches
 * the JCS implementation used in the PQSafe Worker verifier.
 */

/**
 * Canonicalize any JSON-serialisable value to a UTF-8 Uint8Array.
 * Use this as the message input to ML-DSA-65 sign/verify.
 */
export function jcsCanonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(jcsStringify(value))
}

/**
 * Canonicalize any JSON-serialisable value to a canonical JSON string.
 */
export function jcsStringify(value: unknown): string {
  return serialize(value)
}

function serialize(value: unknown): string {
  if (value === null) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new Error('JCS: non-finite numbers (Infinity, NaN) are not allowed')
    }
    return JSON.stringify(value)
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return '[' + value.map(serialize).join(',') + ']'
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted = Object.keys(obj).sort()
    const pairs = sorted.map((k) => JSON.stringify(k) + ':' + serialize(obj[k]))
    return '{' + pairs.join(',') + '}'
  }

  throw new Error(`JCS: unsupported type ${typeof value}`)
}

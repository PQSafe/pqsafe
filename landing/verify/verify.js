// PQSafe envelope verifier — runs entirely client-side.
// Loads @noble/post-quantum + @noble/curves via esm.sh CDN.
// API: verifyEnvelope(envelopeJson) -> { valid, fingerprint, ecdsaOk, mldsaOk, reasons, fields }

import { ml_dsa65 } from 'https://esm.sh/@noble/post-quantum@0.6.0/ml-dsa.js';
import { p256 } from 'https://esm.sh/@noble/curves@1.4.0/p256';
import canonicalize from 'https://esm.sh/canonicalize@2.0.0';

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function hexToBytes(s) {
  return new Uint8Array(s.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function toHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

export async function verifyEnvelope(envelopeJson, ecdsaPubkeyHex, mldsaPubkeyB64u) {
  const reasons = [];
  let valid = false, ecdsaOk = false, mldsaOk = false, fingerprint = null;

  let env;
  try {
    env = typeof envelopeJson === 'string' ? JSON.parse(envelopeJson) : envelopeJson;
  } catch (e) {
    reasons.push('Invalid JSON: ' + e.message);
    return { valid, ecdsaOk, mldsaOk, fingerprint, reasons, fields: null };
  }

  if (!env.signature) {
    reasons.push('No signature field on envelope');
    return { valid, ecdsaOk, mldsaOk, fingerprint, reasons, fields: env };
  }

  // Strip signature, canonicalize remaining mandate fields
  const { signature, ...mandate } = env;
  const canonical = canonicalize(mandate);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const fp = await sha256(canonicalBytes);
  fingerprint = toHex(fp);

  // ECDSA verify
  try {
    const ecdsaSig = b64urlToBytes(signature.ecdsa);
    const ecdsaPk = hexToBytes(ecdsaPubkeyHex);
    const sig = p256.Signature.fromDER ? p256.Signature.fromDER(ecdsaSig) : null;
    ecdsaOk = sig ? p256.verify(sig, fp, ecdsaPk, { lowS: true }) : false;
    if (!ecdsaOk) reasons.push('ECDSA signature invalid for this envelope');
  } catch (e) {
    reasons.push('ECDSA verify error: ' + e.message);
  }

  // ML-DSA-65 verify
  try {
    const mldsaSig = b64urlToBytes(signature.mldsa);
    const mldsaPk = b64urlToBytes(mldsaPubkeyB64u);
    mldsaOk = ml_dsa65.verify(mldsaSig, fp, mldsaPk);
    if (!mldsaOk) reasons.push('ML-DSA-65 signature invalid for this envelope');
  } catch (e) {
    reasons.push('ML-DSA-65 verify error: ' + e.message);
  }

  valid = ecdsaOk && mldsaOk;
  if (valid) reasons.push('Both signatures verified successfully.');
  return {
    valid,
    fingerprint,
    ecdsaOk,
    mldsaOk,
    ecdsaSigBytes: signature.ecdsa ? b64urlToBytes(signature.ecdsa).length : 0,
    mldsaSigBytes: signature.mldsa ? b64urlToBytes(signature.mldsa).length : 0,
    canonicalBytes: canonicalBytes.length,
    reasons,
    fields: mandate,
  };
}

// Tamper an envelope (modify amount field) for failure-mode demo
export function tamperEnvelope(env) {
  const cloned = JSON.parse(JSON.stringify(env));
  if (cloned.amount) cloned.amount = String(parseFloat(cloned.amount) + 0.01);
  if (cloned.spend_cap) cloned.spend_cap = (parseFloat(cloned.spend_cap) + 1);
  return cloned;
}

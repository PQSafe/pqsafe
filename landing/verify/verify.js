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

// Tamper a specific field. Returns { envelope, changed: {field, before, after, kind} }
// kind: 'mandate' = canonical bytes change, both sigs fail
//       'ecdsa'   = only ECDSA signature mutated
//       'mldsa'   = only ML-DSA-65 signature mutated
export function tamperField(env, field) {
  const cloned = JSON.parse(JSON.stringify(env));
  let before, after, kind = 'mandate', note = '';

  const flipChar = (s) => {
    if (!s || s.length < 2) return s + 'x';
    const idx = Math.floor(s.length / 2);
    const c = s[idx];
    const swap = c === 'a' ? 'b' : c === '0' ? '1' : c.toUpperCase() === c.toLowerCase() ? 'X' : (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());
    return s.slice(0, idx) + swap + s.slice(idx + 1);
  };

  switch (field) {
    case 'amount':
      before = cloned.amount;
      after = String((parseFloat(before || '0') + 0.01).toFixed(2));
      cloned.amount = after;
      note = 'Adds 0.01 to the authorized amount.';
      break;
    case 'recipient':
      before = cloned.recipient;
      after = 'did:web:attacker.example.com:payee:rogue';
      cloned.recipient = after;
      note = 'Substitutes recipient with an attacker-controlled DID.';
      break;
    case 'currency':
      before = cloned.currency;
      after = before === 'HKD' ? 'USD' : 'HKD';
      cloned.currency = after;
      note = 'Switches the currency code.';
      break;
    case 'agent_id':
      before = cloned.agent_id;
      after = before ? before.replace(/agent-\w+/, 'agent-attacker') : 'did:web:attacker:agent';
      cloned.agent_id = after;
      note = 'Spoofs the issuing agent identity.';
      break;
    case 'nonce':
      before = cloned.nonce;
      after = flipChar(before || '0'.repeat(32));
      cloned.nonce = after;
      note = 'Flips one character of the replay nonce.';
      break;
    case 'add_field':
      before = '(none)';
      after = '"injected":"malicious"';
      cloned.injected = 'malicious';
      note = 'Injects a new top-level mandate field.';
      break;
    case 'sig_ecdsa':
      before = cloned.signature?.ecdsa?.slice(0, 16) + '…';
      after = flipChar(cloned.signature.ecdsa);
      cloned.signature.ecdsa = after;
      after = after.slice(0, 16) + '…';
      kind = 'ecdsa';
      note = 'Flips one character of the ECDSA signature only. ML-DSA still passes.';
      break;
    case 'sig_mldsa':
      before = cloned.signature?.mldsa?.slice(0, 16) + '…';
      after = flipChar(cloned.signature.mldsa);
      cloned.signature.mldsa = after;
      after = after.slice(0, 16) + '…';
      kind = 'mldsa';
      note = 'Flips one character of the ML-DSA-65 signature only. ECDSA still passes.';
      break;
    default:
      throw new Error('Unknown tamper field: ' + field);
  }

  return { envelope: cloned, changed: { field, before, after, kind, note } };
}

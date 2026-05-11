// PQSafe envelope generator — runs entirely client-side.
// Generates ephemeral keypairs and signs a SpendEnvelope with both
// ECDSA P-256 and ML-DSA-65 (FIPS 204), JCS-canonicalized per RFC 8785.

import { ml_dsa65 } from 'https://esm.sh/@noble/post-quantum@0.6.0/ml-dsa.js';
import { p256 } from 'https://esm.sh/@noble/curves@1.4.0/p256';
import canonicalize from 'https://esm.sh/canonicalize@2.0.0';

function bytesToB64url(b) {
  let s = '';
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

// Generate an ephemeral ECDSA P-256 + ML-DSA-65 keypair.
// Returns { ecdsa: {priv, pub_hex_compressed}, mldsa: {priv, pub_b64url, pub_fingerprint_hex} }
export function generateKeypairs() {
  // ECDSA P-256
  const ecPriv = p256.utils.randomPrivateKey();
  const ecPubFull = p256.getPublicKey(ecPriv, true); // 33-byte compressed
  // ML-DSA-65
  const seed = randomBytes(32);
  const mlKeys = ml_dsa65.keygen(seed);
  return {
    ecdsa: {
      priv: ecPriv,
      pub_hex_compressed: bytesToHex(ecPubFull),
    },
    mldsa: {
      priv: mlKeys.secretKey,
      pub: mlKeys.publicKey,
      pub_b64url: bytesToB64url(mlKeys.publicKey),
    },
  };
}

// Compute the 16-char hex fingerprint of an ML-DSA public key (first 8 bytes of SHA-256).
export async function mldsaFingerprint(pubBytes) {
  const h = await sha256(pubBytes);
  return bytesToHex(h.slice(0, 8));
}

// Issue a SpendEnvelope: JCS canonicalize, SHA-256 fingerprint, dual-sign.
// Returns { envelope, fingerprint_hex, canonical_bytes }
export async function issueEnvelope(mandate, keys) {
  const canonical = canonicalize(mandate);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const fp = await sha256(canonicalBytes);

  // ECDSA P-256 sign — produce DER-encoded signature
  const ecSigObj = p256.sign(fp, keys.ecdsa.priv, { lowS: true });
  const ecDer = ecSigObj.toDERRawBytes ? ecSigObj.toDERRawBytes() : ecSigObj.toDERBytes();

  // ML-DSA-65 sign
  const mlSig = ml_dsa65.sign(keys.mldsa.priv, fp);

  const pubFp = await mldsaFingerprint(keys.mldsa.pub);

  const envelope = {
    ...mandate,
    signature: {
      alg: 'ap2-ecdsa-p256+ap2-mldsa65',
      ecdsa: bytesToB64url(ecDer),
      mldsa: bytesToB64url(mlSig),
      pubkey_fingerprint: pubFp,
    },
  };

  return {
    envelope,
    fingerprint_hex: bytesToHex(fp),
    canonical_bytes: canonicalBytes.length,
    ecdsa_sig_bytes: ecDer.length,
    mldsa_sig_bytes: mlSig.length,
  };
}

export function randomNonce() {
  return bytesToHex(randomBytes(16));
}

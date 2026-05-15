import type { Check, Finding, ScanInput } from '../types.js';

const CLASSICAL_CRYPTO = [
  { pattern: /\bRSA\b/g, label: 'RSA' },
  { pattern: /\bECDSA\b/g, label: 'ECDSA' },
  { pattern: /\bEd25519\b/g, label: 'Ed25519' },
  { pattern: /\bsecp256k1\b/g, label: 'secp256k1 (Ethereum/Bitcoin curve)' },
  { pattern: /createSign\(['"]RSA/g, label: 'RSA signing' },
  { pattern: /generateKeyPair\(['"]rsa/g, label: 'RSA key generation' },
  { pattern: /generateKeyPair\(['"]ec/g, label: 'ECDSA key generation' },
];

const PQ_SAFE = [/ML-DSA/i, /CRYSTALS/i, /Dilithium/i, /ml_dsa/i, /mldsa/i, /pqsafe/i];

export const pqCryptoCheck: Check = {
  id: 'pq-crypto',
  name: 'Quantum-Vulnerable Cryptography',
  run({ code }: ScanInput): Finding[] {
    const hasPQ = PQ_SAFE.some(p => p.test(code));
    if (hasPQ) return [];

    const findings: Finding[] = [];
    const lines = code.split('\n');

    for (const { pattern, label } of CLASSICAL_CRYPTO) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(code)) !== null) {
        const lineNum = code.slice(0, match.index).split('\n').length;
        const snippet = lines[lineNum - 1]?.trim().slice(0, 80);
        findings.push({
          id: 'pq-crypto',
          name: 'Quantum-Vulnerable Cryptography',
          severity: 'MEDIUM',
          status: 'WARN',
          message: `${label} detected at line ${lineNum}. Quantum computers will break this algorithm. NSA CNSA 2.0 mandates migration by 2027.`,
          line: lineNum,
          snippet,
          fix: 'Migrate agent signing to ML-DSA-65 (NIST FIPS 204). Use @pqsafe/sdk for drop-in post-quantum agent authorization.',
          docs: 'https://pqsafe.xyz/scan/docs/pq-crypto',
        });
        break; // one finding per algorithm type
      }
    }

    return findings;
  },
};

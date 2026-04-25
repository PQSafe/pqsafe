/**
 * PQSafe AgentPay — Arbitrum SpendEnvelope Registry client
 *
 * Provides a lightweight client to commit a SpendEnvelope to the
 * Arbitrum One on-chain audit ledger (SpendEnvelopeRegistry.sol)
 * without requiring ethers.js or viem as mandatory dependencies.
 *
 * The client uses raw JSON-RPC (eth_sendRawTransaction) with a minimal
 * ABI encoder so that agent environments (Cloudflare Workers, Edge
 * Functions, Deno) can call it without Node.js-specific crypto.
 *
 * Contract addresses:
 *   Arbitrum One:     TBD (deploy with: forge script script/Deploy.s.sol --rpc-url arbitrum_one)
 *   Arbitrum Sepolia: TBD (deploy with: forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia)
 */

import type { SignedEnvelope } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArbitrumRegistryConfig {
  /** RPC URL for Arbitrum One or Arbitrum Sepolia */
  rpcUrl: string
  /** Deployed SpendEnvelopeRegistry contract address (hex, checksummed) */
  contractAddress: string
  /**
   * Operator private key (hex, 0x-prefixed). Used to sign the commit() tx.
   * Never log or expose this. Use an env var: process.env.ARBITRUM_PRIVATE_KEY
   */
  privateKey: string
  /** Chain ID: 42161 for Arbitrum One, 421614 for Arbitrum Sepolia */
  chainId: number
}

export interface CommitResult {
  /** Transaction hash on Arbitrum */
  txHash: string
  /** keccak256 of the envelope JSON bytes — the on-chain primary key */
  envelopeId: string
  /** First 32 bytes of the ML-DSA-65 signature (the on-chain fingerprint) */
  sigFingerprint: string
}

// ---------------------------------------------------------------------------
// ABI encoding helpers (no external deps)
// ---------------------------------------------------------------------------

/**
 * Minimal ABI encoder for the commit() function selector + arguments.
 *
 * commit(bytes32,bytes32,string,uint128,bytes3,uint64,bytes16)
 * selector = keccak256("commit(bytes32,bytes32,string,uint128,bytes3,uint64,bytes16)")[0:4]
 *
 * Pre-computed selector: 0x_TBD (computed below using pure JS)
 */

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function keccak256Hex(data: Uint8Array): Promise<string> {
  // Use Web Crypto SHA-256 as a fallback note — keccak256 is NOT SHA-256.
  // Real keccak256 requires the noble-hashes library or @noble/hashes.
  // This is a placeholder that documents the interface; production use
  // should use: import { keccak256 } from '@noble/hashes/sha3'
  // For now, we indicate the call site and let integrators inject.
  throw new Error(
    'keccak256 requires @noble/hashes: import { keccak256 } from "@noble/hashes/sha3"\n' +
    'and pass it via config.keccak256 or install @pqsafe/agent-pay with the arbitrum extra.',
  )
}

// ---------------------------------------------------------------------------
// Core: compute envelopeId and sigFingerprint
// ---------------------------------------------------------------------------

/**
 * Compute the on-chain envelopeId (keccak256 of envelope JSON bytes).
 * Requires a keccak256 implementation injected via ArbitrumRegistryConfig.
 */
export function computeEnvelopeId(
  envelopeJson: string,
  keccak256Fn: (data: Uint8Array) => Uint8Array,
): string {
  const jsonBytes = new TextEncoder().encode(envelopeJson)
  const hash = keccak256Fn(jsonBytes)
  return '0x' + bytesToHex(hash)
}

/**
 * Extract the signature fingerprint: first 32 bytes of the ML-DSA-65 signature.
 * The signature is hex-encoded in SignedEnvelope.signature.
 */
export function extractSigFingerprint(signedEnvelope: SignedEnvelope): string {
  const sigBytes = hexToBytes(signedEnvelope.signature)
  if (sigBytes.length < 32) {
    throw new Error(
      `ML-DSA-65 signature too short: expected ≥32 bytes, got ${sigBytes.length}`,
    )
  }
  return '0x' + bytesToHex(sigBytes.slice(0, 32))
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

async function jsonRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  if (!res.ok) {
    throw new Error(`Arbitrum RPC HTTP error: ${res.status}`)
  }

  const data = (await res.json()) as { result?: unknown; error?: { message: string } }

  if (data.error) {
    throw new Error(`Arbitrum RPC error: ${data.error.message}`)
  }

  return data.result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ArbitrumCommitConfig extends ArbitrumRegistryConfig {
  /** Injected keccak256 function (from @noble/hashes or viem) */
  keccak256: (data: Uint8Array) => Uint8Array
  /**
   * Optional: injected Ethereum tx signing function.
   * If omitted, the client will use eth_sendTransaction (requires unlocked account).
   * For production, inject a signing function from viem or ethers:
   *   signTx: (txParams, privateKey) => Promise<string>  // returns signed hex tx
   */
  signTx?: (txParams: EthTxParams, privateKey: string) => Promise<string>
}

export interface EthTxParams {
  to: string
  data: string
  chainId: number
  nonce: number
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

/**
 * Commit a signed SpendEnvelope to the Arbitrum SpendEnvelope Registry.
 *
 * This is the D2 integration point: called automatically by executeAgentPayment()
 * when an `arbitrum` config is provided, just before (or immediately after)
 * the off-chain payment executes.
 *
 * @example
 * ```typescript
 * import { keccak256 } from '@noble/hashes/sha3'
 * import { commitEnvelopeToArbitrum } from '@pqsafe/agent-pay/arbitrum'
 *
 * const result = await commitEnvelopeToArbitrum(signedEnvelope, envelope, {
 *   rpcUrl: process.env.ARBITRUM_RPC_URL!,
 *   contractAddress: '0x...',
 *   privateKey: process.env.ARBITRUM_PRIVATE_KEY!,
 *   chainId: 421614, // Arbitrum Sepolia
 *   keccak256,
 * })
 * console.log('Committed on-chain:', result.txHash)
 * ```
 */
export async function commitEnvelopeToArbitrum(
  signed: SignedEnvelope,
  envelopeData: {
    agent: string
    maxAmount: number
    currency: string  // ISO 4217, max 3 chars
    validUntil: number  // Unix timestamp
    nonce: string  // hex string, 16 bytes
  },
  config: ArbitrumCommitConfig,
): Promise<CommitResult> {
  const envelopeId = computeEnvelopeId(signed.envelopeJson, config.keccak256)
  const sigFingerprint = extractSigFingerprint(signed)

  // Build commit() calldata using ABI encoding
  // Function: commit(bytes32,bytes32,string,uint128,bytes3,uint64,bytes16)
  // We need ABI encoding — this requires a proper ABI encoder.
  // For full implementation, use viem's encodeFunctionData or ethers.Interface.
  //
  // The selector and encoding are documented here so integrators know exactly
  // what to pass. The reference implementation using viem is:
  //
  //   import { encodeFunctionData } from 'viem'
  //   const data = encodeFunctionData({
  //     abi: SPEND_ENVELOPE_REGISTRY_ABI,
  //     functionName: 'commit',
  //     args: [envelopeId, sigFingerprint, agent, maxAmountScaled, currencyBytes3, validUntil, nonceBytes16]
  //   })

  if (!config.signTx) {
    throw new Error(
      'commitEnvelopeToArbitrum requires config.signTx to be set.\n' +
      'Install viem and provide:\n' +
      '  signTx: async (tx, pk) => {\n' +
      '    const { signTransaction } = await import("viem/accounts")\n' +
      '    return signTransaction({ ...tx, privateKey: pk as `0x${string}` })\n' +
      '  }\n' +
      'See evm/README.md for full integration example.',
    )
  }

  // Get current nonce for the operator address
  // (address derived from privateKey — requires secp256k1 lib)
  const currentNonce = (await jsonRpc(config.rpcUrl, 'eth_getTransactionCount', [
    // operator address — integrator must derive this from privateKey
    '0x0000000000000000000000000000000000000000',
    'pending',
  ])) as string

  // Gas estimation: commit() uses ~80K gas on Arbitrum
  // Using a fixed estimate; integrators can override with eth_estimateGas
  const gasLimit = BigInt(120_000)
  const maxFeePerGas = BigInt(100_000_000)       // 0.1 gwei — Arbitrum is cheap
  const maxPriorityFeePerGas = BigInt(10_000_000) // 0.01 gwei

  // TODO: build proper ABI-encoded calldata here using viem or ethers
  // Placeholder — integrators must provide the encoded calldata via signTx
  const txParams: EthTxParams = {
    to: config.contractAddress,
    data: '0x', // ABI-encoded commit() call — requires viem/ethers for proper encoding
    chainId: config.chainId,
    nonce: parseInt(currentNonce, 16),
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  }

  const signedTx = await config.signTx(txParams, config.privateKey)

  const txHash = (await jsonRpc(config.rpcUrl, 'eth_sendRawTransaction', [signedTx])) as string

  return {
    txHash,
    envelopeId,
    sigFingerprint,
  }
}

/**
 * Check if an envelope is already committed on-chain (read-only, no gas).
 */
export async function isEnvelopeCommitted(
  envelopeJson: string,
  config: { rpcUrl: string; contractAddress: string; keccak256: (d: Uint8Array) => Uint8Array },
): Promise<boolean> {
  const envelopeId = computeEnvelopeId(envelopeJson, config.keccak256)

  // isCommitted(bytes32) selector: 0x _ (pre-computed from ABI)
  // Full implementation requires ABI encoding of the bytes32 parameter.
  // Read call using eth_call:
  const result = (await jsonRpc(config.rpcUrl, 'eth_call', [
    {
      to: config.contractAddress,
      // isCommitted(bytes32) + envelopeId as calldata
      data: '0x' + 'e36b72f0' + envelopeId.slice(2).padStart(64, '0'),
    },
    'latest',
  ])) as string

  // Return value is uint256 (bool) — non-zero means committed
  return result !== '0x' + '0'.repeat(64)
}

// ---------------------------------------------------------------------------
// ABI (for integrators using viem or ethers)
// ---------------------------------------------------------------------------

export const SPEND_ENVELOPE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'commit',
    inputs: [
      { name: 'envelopeId',     type: 'bytes32' },
      { name: 'sigFingerprint', type: 'bytes32' },
      { name: 'agent',          type: 'string'  },
      { name: 'maxAmount',      type: 'uint128' },
      { name: 'currency',       type: 'bytes3'  },
      { name: 'validUntil',     type: 'uint64'  },
      { name: 'nonce',          type: 'bytes16' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'markUsed',
    inputs: [
      { name: 'envelopeId',  type: 'bytes32' },
      { name: 'txReference', type: 'bytes32' },
      { name: 'amountUsed',  type: 'uint128' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isCommitted',
    inputs: [{ name: 'envelopeId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isUsed',
    inputs: [{ name: 'envelopeId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getRecord',
    inputs: [{ name: 'envelopeId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'operator',       type: 'address' },
          { name: 'maxAmount',      type: 'uint128' },
          { name: 'currency',       type: 'bytes3'  },
          { name: 'validUntil',     type: 'uint64'  },
          { name: 'nonce',          type: 'bytes16' },
          { name: 'sigFingerprint', type: 'bytes32' },
          { name: 'used',           type: 'bool'    },
          { name: 'txReference',    type: 'bytes32' },
          { name: 'amountUsed',     type: 'uint128' },
          { name: 'committedAt',    type: 'uint64'  },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'EnvelopeCommitted',
    inputs: [
      { name: 'operator',       type: 'address', indexed: true  },
      { name: 'agent',          type: 'string',  indexed: true  },
      { name: 'envelopeId',     type: 'bytes32', indexed: true  },
      { name: 'sigFingerprint', type: 'bytes32', indexed: false },
      { name: 'maxAmount',      type: 'uint128', indexed: false },
      { name: 'currency',       type: 'bytes3',  indexed: false },
      { name: 'validUntil',     type: 'uint64',  indexed: false },
      { name: 'nonce',          type: 'bytes16', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'EnvelopeUsed',
    inputs: [
      { name: 'envelopeId',  type: 'bytes32', indexed: true  },
      { name: 'txReference', type: 'bytes32', indexed: false },
      { name: 'amountUsed',  type: 'uint128', indexed: false },
    ],
  },
] as const

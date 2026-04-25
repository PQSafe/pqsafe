/**
 * USDC-Base rail connector — stablecoin transfers on Coinbase Base network.
 *
 * Flow (real mode):
 *   1. Encode ERC-20 transfer(address,uint256) calldata for USDC
 *   2. Delegate signing + broadcast to injected signAndSend function
 *   3. Poll receipt or return txHash immediately
 *   4. Map result → PaymentResult
 *
 * Architecture note: PQSafe owns the policy layer (envelope verification,
 * allowlist, ceiling). The caller owns the wallet/signing layer via the
 * injected signAndSend function. This separation lets you use any EVM
 * signing backend: viem, ethers, Coinbase CDP AgentKit, or raw noble/curves.
 *
 * USDC contract addresses:
 *   Base mainnet:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *   Base Sepolia:  0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *
 * Required env vars (real mode only):
 *   BASE_NETWORK        — "mainnet" or "sepolia" (default: "sepolia")
 *
 * For signing, inject a signAndSend function (see UsdcBaseSignAndSend below).
 * Or use CDP AgentKit:
 *   npm i @coinbase/agentkit
 *   const { signAndSend } = createCDPSignAndSend(agentkit)
 *
 * Docs:
 *   Base RPC:       https://docs.base.org/network-information
 *   USDC on Base:   https://www.circle.com/blog/usdc-on-base
 *   CDP AgentKit:   https://docs.cdp.coinbase.com/agentkit
 */

import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import type { PaymentRequest, PaymentResult } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDC_ADDRESS = {
  mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const

const BASE_CHAIN_ID = {
  mainnet: 8453,
  sepolia: 84532,
} as const

/** USDC has 6 decimal places (not 18 like ETH) */
const USDC_DECIMALS = 6

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaseNetwork = 'mainnet' | 'sepolia'

/**
 * Caller-injected wallet function. PQSafe calls this with:
 *   to      — USDC contract address
 *   data    — ABI-encoded transfer(address,uint256) calldata
 *   network — "mainnet" | "sepolia"
 *
 * Should return the 0x-prefixed transaction hash.
 *
 * Example with viem:
 *   const signAndSend: UsdcBaseSignAndSend = async ({ to, data, network }) =>
 *     walletClient.sendTransaction({ to, data, chain: network === 'mainnet' ? base : baseSepolia })
 *
 * Example with CDP AgentKit:
 *   const signAndSend: UsdcBaseSignAndSend = async ({ to, data, network }) => {
 *     const tx = await agentkit.sendTransaction({ to, data, network: `base-${network}` })
 *     return tx.transactionHash
 *   }
 */
export interface UsdcBaseTxParams {
  /** USDC contract address on the target network */
  to: string
  /** ABI-encoded transfer(address,uint256) calldata (0x-prefixed hex) */
  data: string
  /** "mainnet" or "sepolia" */
  network: BaseNetwork
  /** Chain ID for EIP-155 replay protection */
  chainId: number
  /** Amount in USDC atomic units (6 decimals) */
  atomicAmount: bigint
  /** Human-readable amount */
  amount: number
}

export type UsdcBaseSignAndSend = (params: UsdcBaseTxParams) => Promise<string>

export interface UsdcBaseConfig {
  /** Wallet/signing delegate. Required for real mode. */
  signAndSend?: UsdcBaseSignAndSend
  /** "mainnet" | "sepolia" — overrides BASE_NETWORK env var */
  network?: BaseNetwork
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readEnv(key: string): string | null {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string
  }
  return null
}

function getNetwork(override?: BaseNetwork): BaseNetwork {
  if (override) return override
  const env = readEnv('BASE_NETWORK')
  if (env === 'mainnet') return 'mainnet'
  return 'sepolia'
}

function isMockMode(): boolean {
  return readEnv('PQSAFE_MOCK_MODE') === '1'
}

// ---------------------------------------------------------------------------
// ERC-20 calldata encoding (no ethers/viem dep — pure @noble/hashes)
// ---------------------------------------------------------------------------

/** Compute 4-byte function selector: keccak256(sig).slice(0,4) */
function functionSelector(sig: string): Uint8Array {
  return keccak_256(new TextEncoder().encode(sig)).slice(0, 4)
}

/** Zero-pad a hex address to 32 bytes (ABI encoding for address type) */
function abiEncodeAddress(addr: string): Uint8Array {
  const clean = addr.toLowerCase().replace(/^0x/, '')
  if (clean.length !== 40) throw new Error(`Invalid EVM address: ${addr}`)
  const padded = new Uint8Array(32)
  const addrBytes = hexToUint8Array(clean)
  padded.set(addrBytes, 12) // left-pad with 12 zero bytes
  return padded
}

/** Big-endian 32-byte encoding for uint256 */
function abiEncodeUint256(value: bigint): Uint8Array {
  const result = new Uint8Array(32)
  let v = value
  for (let i = 31; i >= 0; i--) {
    result[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return result
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Encode ERC-20 transfer(address,uint256) calldata.
 * Returns 0x-prefixed hex string.
 */
export function encodeTransferCalldata(to: string, amount: bigint): string {
  const selector = functionSelector('transfer(address,uint256)')
  const encodedTo = abiEncodeAddress(to)
  const encodedAmount = abiEncodeUint256(amount)

  const calldata = new Uint8Array(4 + 32 + 32)
  calldata.set(selector, 0)
  calldata.set(encodedTo, 4)
  calldata.set(encodedAmount, 36)

  return '0x' + bytesToHex(calldata)
}

/**
 * Convert a decimal USDC amount to atomic units (6 decimals).
 * E.g. 1.5 USDC → 1_500_000n
 */
export function toUsdcAtomicUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS))
}

// ---------------------------------------------------------------------------
// Validate recipient is an Ethereum address
// ---------------------------------------------------------------------------

function isEvmAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

// ---------------------------------------------------------------------------
// Public rail interface
// ---------------------------------------------------------------------------

/**
 * Execute a USDC payment on Base.
 *
 * config.signAndSend must be provided for real-mode execution.
 * If not provided (or PQSAFE_MOCK_MODE=1), runs in mock mode.
 */
export async function executePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
  config?: UsdcBaseConfig,
): Promise<PaymentResult> {
  const network = getNetwork(config?.network)
  const mock = isMockMode() || !config?.signAndSend

  // -------------------------------------------------------------------------
  // Validate recipient is an EVM address
  // -------------------------------------------------------------------------
  if (!isEvmAddress(request.recipient)) {
    throw new Error(
      `PQSafe/USDC-Base: recipient must be a 0x EVM address, got: ${request.recipient}`,
    )
  }

  // -------------------------------------------------------------------------
  // Mock path
  // -------------------------------------------------------------------------
  if (mock) {
    const mockHash = '0x' + bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)))
    return {
      success: true,
      rail: 'usdc-base',
      txId: mockHash,
      amount: request.amount,
      currency: 'USDC',
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: true,
        network,
        chainId: BASE_CHAIN_ID[network],
        usdcContract: USDC_ADDRESS[network],
        agent: envelope.agent,
        issuer: envelope.issuer,
        envelopeNonce: envelope.nonce,
        memo: request.memo ?? null,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Real path — delegate to injected signer
  // -------------------------------------------------------------------------
  const atomicAmount = toUsdcAtomicUnits(request.amount)
  const usdcContract = USDC_ADDRESS[network]
  const calldata = encodeTransferCalldata(request.recipient, atomicAmount)

  const txHash = await config!.signAndSend!({
    to: usdcContract,
    data: calldata,
    network,
    chainId: BASE_CHAIN_ID[network],
    atomicAmount,
    amount: request.amount,
  })

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(`PQSafe/USDC-Base: signAndSend returned invalid tx hash: ${txHash}`)
  }

  return {
    success: true,
    rail: 'usdc-base',
    txId: txHash,
    amount: request.amount,
    currency: 'USDC',
    recipient: request.recipient,
    executedAt: new Date().toISOString(),
    meta: {
      mock: false,
      network,
      chainId: BASE_CHAIN_ID[network],
      usdcContract,
      atomicAmount: atomicAmount.toString(),
      agent: envelope.agent,
      issuer: envelope.issuer,
      envelopeNonce: envelope.nonce,
      memo: request.memo ?? null,
    },
  }
}

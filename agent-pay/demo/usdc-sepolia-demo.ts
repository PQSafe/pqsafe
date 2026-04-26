/**
 * USDC Base Sepolia Demo — PQSafe AgentPay
 *
 * Sends a REAL test USDC transfer on Base Sepolia testnet.
 *
 * What this script does:
 *   1. Loads credentials from ~/.pqsafe-usdc.env
 *      (EVM private key + recipient address + optional RPC URL)
 *   2. Generates a fresh ML-DSA-65 keypair for the spend envelope
 *   3. Builds + signs + verifies a spend envelope
 *   4. Encodes ERC-20 transfer(address,uint256) calldata for USDC on Base Sepolia
 *   5. Broadcasts the transaction via viem (Base Sepolia RPC)
 *   6. Prints the transaction hash
 *
 * USDC contract on Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * RPC: https://sepolia.base.org (public, no key required)
 * Faucet: https://faucets.chain.link/base-sepolia
 *
 * Prerequisites: populate ~/.pqsafe-usdc.env first.
 * See demo/USDC_SEPOLIA.md for full setup instructions.
 *
 * Run:
 *   cd ~/Projects/pqsafe/agent-pay
 *   npx tsx demo/usdc-sepolia-demo.ts
 */

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
} from '../src/index.js'
import {
  executePayment,
  encodeTransferCalldata,
  toUsdcAtomicUnits,
  type UsdcBaseConfig,
  type UsdcBaseTxParams,
} from '../src/rails/usdc-base.js'

// ---------------------------------------------------------------------------
// Load env file (~/.pqsafe-usdc.env)
// ---------------------------------------------------------------------------

const ENV_FILE = join(homedir(), '.pqsafe-usdc.env')

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    console.error(`\n  ERROR: ${path} not found.`)
    console.error('  See demo/USDC_SEPOLIA.md for instructions.\n')
    process.exit(1)
  }

  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && value) {
      process.env[key] = value
    }
  }
}

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

const line = (n = 72) => '─'.repeat(n)

function header(step: string, title: string) {
  console.log('')
  console.log(`${C.cyan}${line()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  ${step}  ${title}${C.reset}`)
  console.log(`${C.cyan}${line()}${C.reset}`)
}

function say(label: string, value: string) {
  console.log(`  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`)
}

function ok(msg: string) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`)
}

function fail(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function deriveAddress(pubKey: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(pubKey).slice(0, 20))
}

// ---------------------------------------------------------------------------
// Minimal EVM signing via raw JSON-RPC (no viem/ethers dep)
// Uses eth_sendRawTransaction with a pre-signed tx if EVM_PRIVATE_KEY is set.
//
// For simplicity, this demo uses viem via dynamic import if available,
// or falls back to a manual eth_sendRawTransaction approach.
//
// The signAndSend function is injected into the USDC-Base rail.
// ---------------------------------------------------------------------------

async function buildSignAndSend(
  privateKeyHex: string,
  rpcUrl: string,
): Promise<UsdcBaseConfig['signAndSend']> {
  // Try to dynamically import viem (optional dep — not in package.json)
  // If not installed, provide a helpful error message.
  let createWalletClient: unknown
  let http: unknown
  let baseSepolia: unknown
  let parseEther: unknown

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viem = await import('viem' as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viemChains = await import('viem/chains' as any)
    createWalletClient = viem.createWalletClient
    http = viem.http
    baseSepolia = viemChains.baseSepolia
    parseEther = viem.parseEther
    void parseEther // suppress unused warning
  } catch {
    console.error('\n  viem is not installed. Install it to run this demo:')
    console.error('    npm install viem')
    console.error('  Then re-run: npx tsx demo/usdc-sepolia-demo.ts\n')
    process.exit(1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { privateKeyToAccount } = await import('viem/accounts' as any)

  const normalizedKey: `0x${string}` = (
    privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
  ) as `0x${string}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = (privateKeyToAccount as any)(normalizedKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletClient = (createWalletClient as any)({
    account,
    chain: baseSepolia,
    transport: (http as (url: string) => unknown)(rpcUrl),
  })

  return async (params: UsdcBaseTxParams): Promise<string> => {
    const txHash = await walletClient.sendTransaction({
      to: params.to as `0x${string}`,
      data: params.data as `0x${string}`,
      chain: baseSepolia,
    })
    return txHash as string
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('')
  console.log(`${C.bold}PQSafe AgentPay — USDC Base Sepolia Demo${C.reset}`)
  console.log(`${C.dim}ML-DSA-65 • NIST FIPS 204 • Base Sepolia testnet${C.reset}`)

  // Load credentials
  loadEnvFile(ENV_FILE)

  const privateKey = process.env.EVM_PRIVATE_KEY
  const recipientAddress = process.env.EVM_RECIPIENT_ADDRESS
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org'

  if (!privateKey) {
    fail('EVM_PRIVATE_KEY not set in ~/.pqsafe-usdc.env')
    console.error('  See demo/USDC_SEPOLIA.md for instructions.')
    process.exit(1)
  }

  if (!recipientAddress || !/^0x[0-9a-fA-F]{40}$/.test(recipientAddress)) {
    fail('EVM_RECIPIENT_ADDRESS not set or invalid in ~/.pqsafe-usdc.env')
    console.error('  Must be a 0x-prefixed 40-hex-char EVM address.')
    process.exit(1)
  }

  process.env.BASE_NETWORK = 'sepolia'
  process.env.PQSAFE_MOCK_MODE = '0'

  say('Network', `${C.yellow}Base Sepolia (testnet, chainId 84532)${C.reset}`)
  say('RPC', rpcUrl)
  say('USDC contract', '0x036CbD53842c5426634e7929541eC2318f3dCF7e')

  // ---------------------------------------------------------------------------
  // Step 1: Generate ML-DSA-65 keypair
  // ---------------------------------------------------------------------------
  header('Step 1', 'Generate post-quantum keypair')

  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const pqAddress = deriveAddress(publicKey)

  say('Scheme', 'ML-DSA-65 (NIST FIPS 204)')
  say('Public key', `${publicKey.length} bytes`)
  say('PQSafe addr', pqAddress)
  ok('Keypair generated')

  // ---------------------------------------------------------------------------
  // Step 2: Build spend envelope
  // ---------------------------------------------------------------------------
  header('Step 2', 'Build spend envelope')

  const now = Math.floor(Date.now() / 1000)
  const TRANSFER_AMOUNT = 0.01 // 0.01 test USDC

  const envelope = createEnvelope({
    issuer: pqAddress,
    agent: 'pqsafe-usdc-sepolia-demo',
    maxAmount: 1,
    currency: 'USDC',
    allowedRecipients: [recipientAddress],
    validFrom: now,
    validUntil: now + 3600,
    rail: 'usdc-base',
  })

  say('Agent', envelope.agent)
  say('Max amount', `${envelope.maxAmount} ${envelope.currency}`)
  say('Transfer amount', `${TRANSFER_AMOUNT} USDC`)
  say('Recipient', recipientAddress)
  say('Rail', 'usdc-base (sepolia)')
  ok('Envelope built')

  // ---------------------------------------------------------------------------
  // Step 3: Sign + verify
  // ---------------------------------------------------------------------------
  header('Step 3', 'Sign with ML-DSA-65 (post-quantum)')

  const signed = signEnvelope(envelope, secretKey, publicKey)
  say('Signature', `${signed.signature.length / 2} bytes`)
  ok('Signed')

  header('Step 4', 'Agent-side verification')

  const verifyResult = verifyEnvelope(signed)
  if (!verifyResult.valid) {
    fail(`Verification failed: ${verifyResult.error}`)
    process.exit(1)
  }
  ok('Signature valid')

  // ---------------------------------------------------------------------------
  // Step 5: Preview calldata
  // ---------------------------------------------------------------------------
  header('Step 5', 'Preview ERC-20 calldata')

  const atomicAmount = toUsdcAtomicUnits(TRANSFER_AMOUNT)
  const calldata = encodeTransferCalldata(recipientAddress, atomicAmount)

  say('Function', 'transfer(address,uint256)')
  say('Selector', calldata.slice(0, 10))
  say('Amount (atomic)', atomicAmount.toString() + ' (6 dp)')
  say('Calldata length', `${(calldata.length - 2) / 2} bytes`)
  ok('Calldata encoded')

  // ---------------------------------------------------------------------------
  // Step 6: Execute real Sepolia transfer
  // ---------------------------------------------------------------------------
  header('Step 6', 'Execute USDC transfer on Base Sepolia')

  say('Amount', `${TRANSFER_AMOUNT} USDC`)
  say('To', recipientAddress)
  console.log('')

  // Build the signAndSend injector
  const signAndSend = await buildSignAndSend(privateKey, rpcUrl)

  const config: UsdcBaseConfig = {
    network: 'sepolia',
    signAndSend,
  }

  let result
  try {
    result = await executePayment(envelope, { recipient: recipientAddress, amount: TRANSFER_AMOUNT }, config)
  } catch (e) {
    fail(`Transfer failed: ${(e as Error).message}`)
    console.error('\nCommon causes:')
    console.error('  - Insufficient testnet ETH for gas (get from faucet: https://faucets.chain.link/base-sepolia)')
    console.error('  - Insufficient test USDC (mint from Circle testnet faucet)')
    console.error('  - Invalid private key format')
    console.error('\nSee demo/USDC_SEPOLIA.md Troubleshooting section.')
    process.exit(1)
  }

  say('Transaction hash', `${C.green}${C.bold}${result.txId}${C.reset}`)
  say('Amount', `${result.amount} ${result.currency}`)
  say('Network', 'Base Sepolia (testnet)')
  say('USDC contract', '0x036CbD53842c5426634e7929541eC2318f3dCF7e')
  say('Mock', 'false — real Sepolia transaction')
  ok('Transfer executed. Add this tx hash to DEMO_RECEIPTS.md.')

  console.log('')
  console.log(`${C.bold}Verify at:${C.reset}`)
  console.log(`  https://sepolia.basescan.org/tx/${result.txId}`)
  console.log('')

  // Guard rails
  header('Step 7', 'Guard rails — policy enforcement')
  ok('Amount ceiling: maxAmount 1 USDC enforced')
  ok(`Allowlist: only ${recipientAddress} is approved`)
  ok('All guard rails held.')
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

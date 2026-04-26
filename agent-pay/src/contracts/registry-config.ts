/**
 * PQSafe AgentPay — Registry Contract Address Config
 *
 * Maps chain ID → deployed SpendEnvelopeRegistryV2_1 contract address.
 *
 * AFTER DEPLOYING TO SEPOLIA:
 *   Replace SEPOLIA_PLACEHOLDER with the actual deployed address.
 *   Raymond gets the address from the forge deploy log:
 *     DEPLOYED_ADDRESS=0x...
 *   Or from: evm/broadcast/DeployV2_1_Sepolia.s.sol/421614/run-latest.json
 *
 * AFTER DEPLOYING TO MAINNET (post-Sherlock audit):
 *   Replace MAINNET_PLACEHOLDER with the actual deployed address.
 */

// ── Chain IDs ────────────────────────────────────────────────────────────────

export const CHAIN_ARBITRUM_ONE     = 42161   // Arbitrum One (mainnet)
export const CHAIN_ARBITRUM_SEPOLIA = 421614  // Arbitrum Sepolia (testnet)
export const CHAIN_ANVIL_LOCAL      = 31337   // Local Anvil dev node

// ── Registry addresses ────────────────────────────────────────────────────────

/**
 * Registry addresses per chain.
 *
 * Key:   EVM chain ID (number)
 * Value: checksummed contract address (string)
 *
 * Placeholder pattern: `0x0000...XXXX` where XXXX is a mnemonic suffix.
 *   - 5e90 = "SEPOlia" testnet
 *   - A110 = "Arbitrum 1 One" mainnet
 */
export const REGISTRY_ADDRESSES: Record<number, string> = {
  // ── Arbitrum Sepolia (testnet) ─────────────────────────────────────────────
  // TODO(raymond): Replace after `forge script script/DeployV2_1_Sepolia.s.sol --broadcast`
  [CHAIN_ARBITRUM_SEPOLIA]: "0x0000000000000000000000000000000000005e90",

  // ── Arbitrum One (mainnet) ─────────────────────────────────────────────────
  // TODO(raymond): Replace post-Sherlock audit mainnet deploy (Sprint 7, Aug 2026)
  [CHAIN_ARBITRUM_ONE]: "0x000000000000000000000000000000000000A110",

  // ── Local Anvil ───────────────────────────────────────────────────────────
  // Used by `forge test` e2e suite and local dev. Stable deterministic address
  // from CREATE2 with DEPLOY_SALT in DeployV2_1_Sepolia.s.sol run against Anvil.
  // Note: This address is NOT stable across runs unless you use CREATE2 consistently.
  [CHAIN_ANVIL_LOCAL]: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
}

// ── Deployment metadata ───────────────────────────────────────────────────────

export interface RegistryDeployment {
  address: string
  chainId: number
  network: string
  contractVersion: string
  /** ISO 8601 deploy date, or null if not yet deployed */
  deployedAt: string | null
  /** Arbiscan URL, or null if not yet deployed */
  explorerUrl: string | null
  /** Subgraph endpoint, or null if not yet deployed */
  subgraphUrl: string | null
}

export const REGISTRY_DEPLOYMENTS: Record<number, RegistryDeployment> = {
  [CHAIN_ARBITRUM_SEPOLIA]: {
    address:         REGISTRY_ADDRESSES[CHAIN_ARBITRUM_SEPOLIA],
    chainId:         CHAIN_ARBITRUM_SEPOLIA,
    network:         "arbitrum-sepolia",
    contractVersion: "2.1.0",
    deployedAt:      null, // TODO: fill after deploy
    explorerUrl:     null, // TODO: https://sepolia.arbiscan.io/address/<ADDR>
    subgraphUrl:     null, // TODO: https://api.thegraph.com/subgraphs/name/pqsafe/pqsafe-agentpay-sepolia
  },
  [CHAIN_ARBITRUM_ONE]: {
    address:         REGISTRY_ADDRESSES[CHAIN_ARBITRUM_ONE],
    chainId:         CHAIN_ARBITRUM_ONE,
    network:         "arbitrum-one",
    contractVersion: "2.1.0",
    deployedAt:      null, // TODO: fill post-Sherlock mainnet deploy
    explorerUrl:     null, // TODO: https://arbiscan.io/address/<ADDR>
    subgraphUrl:     null, // TODO: fill after subgraph deploy
  },
  [CHAIN_ANVIL_LOCAL]: {
    address:         REGISTRY_ADDRESSES[CHAIN_ANVIL_LOCAL],
    chainId:         CHAIN_ANVIL_LOCAL,
    network:         "anvil-local",
    contractVersion: "2.1.0",
    deployedAt:      "local",
    explorerUrl:     null,
    subgraphUrl:     null,
  },
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Get the registry contract address for the given chain.
 * Throws if the chain is not configured.
 */
export function getRegistryAddress(chainId: number): string {
  const addr = REGISTRY_ADDRESSES[chainId]
  if (!addr) {
    throw new Error(
      `PQSafe registry not configured for chain ${chainId}. ` +
      `Known chains: ${Object.keys(REGISTRY_ADDRESSES).join(", ")}`
    )
  }
  return addr
}

/**
 * Returns true if the address for the given chain is still a placeholder
 * (i.e., deploy has not happened yet).
 */
export function isPlaceholderAddress(chainId: number): boolean {
  const addr = REGISTRY_ADDRESSES[chainId]
  if (!addr) return true
  // Placeholder pattern: 24+ leading zeros
  return addr.toLowerCase().startsWith("0x000000000000000000000000")
}

/**
 * Get deployment metadata for a chain.
 */
export function getRegistryDeployment(chainId: number): RegistryDeployment | null {
  return REGISTRY_DEPLOYMENTS[chainId] ?? null
}

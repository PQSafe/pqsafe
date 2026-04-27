/**
 * PQSafe AgentPay — registry-config.ts smoke tests (Vitest)
 *
 * Minimal coverage lift for src/contracts/registry-config.ts.
 * Exercises all exported constants, helpers, and lookup functions.
 */

import { describe, it, expect } from 'vitest'
import {
  CHAIN_ARBITRUM_ONE,
  CHAIN_ARBITRUM_SEPOLIA,
  CHAIN_ANVIL_LOCAL,
  REGISTRY_ADDRESSES,
  REGISTRY_DEPLOYMENTS,
  getRegistryAddress,
  isPlaceholderAddress,
  getRegistryDeployment,
} from '../src/contracts/registry-config.js'

describe('registry-config — chain ID constants', () => {
  it('CHAIN_ARBITRUM_ONE is 42161', () => {
    expect(CHAIN_ARBITRUM_ONE).toBe(42161)
  })

  it('CHAIN_ARBITRUM_SEPOLIA is 421614', () => {
    expect(CHAIN_ARBITRUM_SEPOLIA).toBe(421614)
  })

  it('CHAIN_ANVIL_LOCAL is 31337', () => {
    expect(CHAIN_ANVIL_LOCAL).toBe(31337)
  })
})

describe('registry-config — REGISTRY_ADDRESSES', () => {
  it('has an entry for all three known chains', () => {
    expect(REGISTRY_ADDRESSES[CHAIN_ARBITRUM_SEPOLIA]).toBeDefined()
    expect(REGISTRY_ADDRESSES[CHAIN_ARBITRUM_ONE]).toBeDefined()
    expect(REGISTRY_ADDRESSES[CHAIN_ANVIL_LOCAL]).toBeDefined()
  })

  it('all addresses start with 0x', () => {
    for (const addr of Object.values(REGISTRY_ADDRESSES)) {
      expect(addr).toMatch(/^0x/)
    }
  })
})

describe('getRegistryAddress()', () => {
  it('returns the Sepolia address for chain 421614', () => {
    const addr = getRegistryAddress(CHAIN_ARBITRUM_SEPOLIA)
    expect(addr).toBe(REGISTRY_ADDRESSES[CHAIN_ARBITRUM_SEPOLIA])
  })

  it('returns the Anvil address for chain 31337', () => {
    const addr = getRegistryAddress(CHAIN_ANVIL_LOCAL)
    expect(addr).toMatch(/^0x/)
  })

  it('throws for an unknown chain ID', () => {
    expect(() => getRegistryAddress(99999)).toThrow(/not configured/)
  })
})

describe('isPlaceholderAddress()', () => {
  it('returns true for Sepolia (not yet deployed)', () => {
    expect(isPlaceholderAddress(CHAIN_ARBITRUM_SEPOLIA)).toBe(true)
  })

  it('returns true for Arbitrum One (not yet deployed)', () => {
    expect(isPlaceholderAddress(CHAIN_ARBITRUM_ONE)).toBe(true)
  })

  it('returns false for Anvil local (has a real deterministic address)', () => {
    expect(isPlaceholderAddress(CHAIN_ANVIL_LOCAL)).toBe(false)
  })

  it('returns true for unknown chain (no address configured)', () => {
    expect(isPlaceholderAddress(99999)).toBe(true)
  })
})

describe('getRegistryDeployment()', () => {
  it('returns a deployment record for Sepolia', () => {
    const d = getRegistryDeployment(CHAIN_ARBITRUM_SEPOLIA)
    expect(d).not.toBeNull()
    expect(d?.network).toBe('arbitrum-sepolia')
    expect(d?.contractVersion).toBe('2.1.0')
  })

  it('returns a deployment record for Arbitrum One', () => {
    const d = getRegistryDeployment(CHAIN_ARBITRUM_ONE)
    expect(d?.network).toBe('arbitrum-one')
  })

  it('returns a deployment record for Anvil local', () => {
    const d = getRegistryDeployment(CHAIN_ANVIL_LOCAL)
    expect(d?.network).toBe('anvil-local')
    expect(d?.deployedAt).toBe('local')
  })

  it('returns null for unknown chain', () => {
    expect(getRegistryDeployment(99999)).toBeNull()
  })

  it('REGISTRY_DEPLOYMENTS has all three chain entries', () => {
    expect(REGISTRY_DEPLOYMENTS[CHAIN_ARBITRUM_SEPOLIA]).toBeDefined()
    expect(REGISTRY_DEPLOYMENTS[CHAIN_ARBITRUM_ONE]).toBeDefined()
    expect(REGISTRY_DEPLOYMENTS[CHAIN_ANVIL_LOCAL]).toBeDefined()
  })
})

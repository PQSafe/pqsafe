// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SpendEnvelopeRegistryV2.sol";

/**
 * @title DeployV2
 * @notice Foundry deploy script for SpendEnvelopeRegistryV2.
 *
 * Supports deterministic CREATE2 deployment via forge's --create2-deployer flag.
 * The salt is derived from the contract name + version tag so the address is
 * predictable across Arbitrum Sepolia and Arbitrum One.
 *
 * Usage (local anvil):
 *   anvil &
 *   forge script script/DeployV2.s.sol --rpc-url http://localhost:8545 \
 *     --private-key $PRIVATE_KEY --broadcast
 *
 * Usage (Arbitrum Sepolia):
 *   forge script script/DeployV2.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY --broadcast --verify \
 *     --etherscan-api-key $ARBISCAN_API_KEY
 *
 * Usage (Arbitrum One — use hardware wallet):
 *   forge script script/DeployV2.s.sol --rpc-url $ARBITRUM_RPC_URL \
 *     --ledger --hd-paths "m/44'/60'/0'/0/0" --broadcast --verify \
 *     --etherscan-api-key $ARBISCAN_API_KEY
 *
 * Environment variables required:
 *   ADMIN_ADDRESS    — multi-sig address to receive DEFAULT_ADMIN_ROLE
 *   PRIVATE_KEY      — deployer private key (testnet / local only; use ledger for mainnet)
 *   ARBITRUM_RPC_URL          — Arbitrum One RPC endpoint
 *   ARBITRUM_SEPOLIA_RPC_URL  — Arbitrum Sepolia RPC endpoint
 *   ARBISCAN_API_KEY          — for Etherscan verification
 */
contract DeployV2 is Script {

    /// @dev CREATE2 salt — change version string to redeploy at a new address.
    bytes32 public constant DEPLOY_SALT =
        keccak256("PQSafe.SpendEnvelopeRegistryV2.v2.0.0");

    function run() external {
        address admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        require(admin != address(0), "DeployV2: ADMIN_ADDRESS must be set");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== PQSafe AgentPay - SpendEnvelopeRegistryV2 Deploy ===");
        console.log("Deployer:    ", deployer);
        console.log("Admin:       ", admin);
        console.log("Chain ID:    ", block.chainid);
        console.log("Balance:     ", deployer.balance / 1e15, "mETH");
        console.log("Salt:        ");
        console.logBytes32(DEPLOY_SALT);

        vm.startBroadcast(deployerPrivateKey);

        // Standard deployment (non-CREATE2).
        // For deterministic CREATE2 across chains, run with:
        //   forge script ... --create2-salt <DEPLOY_SALT>
        SpendEnvelopeRegistryV2 registry = new SpendEnvelopeRegistryV2(admin);

        vm.stopBroadcast();

        console.log("SpendEnvelopeRegistryV2 deployed to:", address(registry));
        console.log("DEFAULT_ADMIN_ROLE granted to:      ", admin);
        console.log("");
        console.log("Post-deploy checklist:");
        console.log("  1. Verify on Etherscan/Arbiscan (add --verify flag above)");
        console.log("  2. Grant ISSUER_ROLE to agent operator wallets");
        console.log("  3. Grant OPERATOR_ROLE to payment executor service");
        console.log("  4. Grant REVOCATION_ROLE to compliance officer wallet");
        console.log("  5. Deploy The Graph subgraph (see pqsafe_subgraph_spec)");
        console.log("  6. Publish ABI to npm: @pqsafe/agent-pay-contracts");
    }
}

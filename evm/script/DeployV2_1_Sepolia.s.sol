// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendEnvelopeRegistryV2_1} from "../src/SpendEnvelopeRegistryV2_1.sol";

/**
 * @title DeployV2_1_Sepolia
 * @notice Foundry deploy script for SpendEnvelopeRegistryV2_1 on Arbitrum Sepolia (chain 421614).
 *
 * MODES
 * -----
 *   --simulate  (default, no --broadcast): dry-run locally, no tx sent
 *   --broadcast                          : broadcast to Arbitrum Sepolia
 *   --broadcast --verify                 : broadcast + verify on Arbiscan Sepolia
 *
 * FULL COMMAND (Raymond runs when ready):
 *   cd ~/Projects/pqsafe/evm
 *   forge script script/DeployV2_1_Sepolia.s.sol \
 *     --rpc-url $ARB_SEPOLIA_RPC \
 *     --private-key $TESTNET_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * DRY-RUN (no keys required — simulates against fork):
 *   forge script script/DeployV2_1_Sepolia.s.sol --rpc-url $ARB_SEPOLIA_RPC
 *
 * ENVIRONMENT VARIABLES
 * ---------------------
 *   ADMIN_ADDRESS         — receives DEFAULT_ADMIN_ROLE (testnet wallet, e.g. MetaMask)
 *   TEST_ISSUER_ADDRESS   — receives ISSUER_ROLE (test issuer; defaults to ADMIN_ADDRESS)
 *   TEST_PAUSER_ADDRESS   — receives PAUSER_ROLE (separate from admin; defaults to 0xAB0...0)
 *   TESTNET_KEY           — deployer private key (DO NOT USE MAINNET KEY)
 *   ARB_SEPOLIA_RPC       — Alchemy/Infura Arbitrum Sepolia endpoint
 *   ETHERSCAN_API_KEY     — Arbiscan API key for source verification
 *
 * DEPLOY JSON
 * -----------
 * After broadcast, forge writes broadcast/DeployV2_1_Sepolia.s.sol/421614/run-latest.json
 * The VerifyOnEtherscan.sh script reads the contract address from that file.
 *
 * CREATE2 SALT
 * ------------
 * Salt: keccak256("PQSafe.SpendEnvelopeRegistryV2_1.v2.1.0.sepolia")
 * This produces a deterministic address that differs from mainnet (different salt suffix)
 * so testnet and mainnet are always separate contracts.
 *
 * Chain ID: 421614 (Arbitrum Sepolia)
 */
contract DeployV2_1_Sepolia is Script {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant EXPECTED_CHAIN_ID = 421614; // Arbitrum Sepolia

    /// @dev CREATE2 salt — testnet uses a distinct suffix so mainnet address differs.
    bytes32 public constant DEPLOY_SALT =
        keccak256("PQSafe.SpendEnvelopeRegistryV2_1.v2.1.0.sepolia");

    /// @dev Fallback test pauser address — Forta-style EOA for testnet circuit-breaker drills.
    address public constant DEFAULT_TEST_PAUSER = address(0x000000000000000000000000000000000000aB01);

    // -------------------------------------------------------------------------
    // run()
    // -------------------------------------------------------------------------

    function run() external {
        // ── Chain guard ──────────────────────────────────────────────────────
        // Allow fork/simulate (chainid may be 31337 on Anvil fork) OR real Sepolia.
        if (block.chainid != EXPECTED_CHAIN_ID && block.chainid != 31337) {
            revert(
                string(
                    abi.encodePacked(
                        "DeployV2_1_Sepolia: wrong chain. Expected 421614 (Arb Sepolia) or 31337 (Anvil). Got: ",
                        _uintToStr(block.chainid)
                    )
                )
            );
        }

        // ── Read env vars ────────────────────────────────────────────────────
        address admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        require(admin != address(0), "DeployV2_1_Sepolia: ADMIN_ADDRESS must be non-zero");

        address testIssuer  = vm.envOr("TEST_ISSUER_ADDRESS",  admin);
        address testPauser  = vm.envOr("TEST_PAUSER_ADDRESS",  DEFAULT_TEST_PAUSER);

        uint256 deployerKey = vm.envUint("TESTNET_KEY");
        address deployer    = vm.addr(deployerKey);

        // ── Pre-flight log ───────────────────────────────────────────────────
        console.log("========================================================");
        console.log("  PQSafe AgentPay - SpendEnvelopeRegistryV2_1 DEPLOY");
        console.log("  Target: Arbitrum Sepolia (chain 421614)");
        console.log("========================================================");
        console.log("Deployer:          ", deployer);
        console.log("Admin:             ", admin);
        console.log("Test Issuer:       ", testIssuer);
        console.log("Test Pauser:       ", testPauser);
        console.log("Chain ID (actual): ", block.chainid);
        console.log("Balance (mETH):    ", deployer.balance / 1e15);
        console.log("Salt:");
        console.logBytes32(DEPLOY_SALT);
        console.log("");

        // ── Deploy ───────────────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);

        SpendEnvelopeRegistryV2_1 registry = new SpendEnvelopeRegistryV2_1{salt: DEPLOY_SALT}(admin);

        // ── Role assignments ─────────────────────────────────────────────────
        registry.grantRole(registry.ISSUER_ROLE(),  testIssuer);
        registry.grantRole(registry.PAUSER_ROLE(),  testPauser);
        // Note: OPERATOR_ROLE and REVOCATION_ROLE are NOT granted here intentionally.
        // Raymond grants those after deploy to specific service accounts.

        vm.stopBroadcast();

        // ── Post-deploy verification log ─────────────────────────────────────
        address addr = address(registry);
        console.log("========================================================");
        console.log("  DEPLOY SUCCESSFUL");
        console.log("========================================================");
        console.log("Contract address:  ", addr);
        console.log("paused():          ", registry.paused());
        console.log("");
        console.log("-- Role state --");
        console.log("DEFAULT_ADMIN_ROLE -> admin:      ", registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        console.log("ISSUER_ROLE        -> testIssuer: ", registry.hasRole(registry.ISSUER_ROLE(), testIssuer));
        console.log("PAUSER_ROLE        -> testPauser: ", registry.hasRole(registry.PAUSER_ROLE(), testPauser));
        console.log("OPERATOR_ROLE      -> admin:      ", registry.hasRole(registry.OPERATOR_ROLE(), admin));
        console.log("");
        console.log("-- Constants --");
        console.log("PAUSER_ROLE:       ");
        console.logBytes32(registry.PAUSER_ROLE());
        console.log("ISSUER_ROLE:       ");
        console.logBytes32(registry.ISSUER_ROLE());
        console.log("");
        console.log("-- Post-deploy checklist --");
        console.log("  1. Verify on Arbiscan:  forge verify-contract <addr> SpendEnvelopeRegistryV2_1 ...");
        console.log("     (or run script/VerifyOnEtherscan.sh)");
        console.log("  2. Grant OPERATOR_ROLE to payment executor service address");
        console.log("  3. Grant REVOCATION_ROLE to compliance officer address");
        console.log("  4. Run e2e test:  forge test --match-contract E2EAnvilTest -vv");
        console.log("  5. Update SDK registry config with contract address above");
        console.log("  6. Deploy subgraph:  see evm/subgraph/sepolia/README.md");
        console.log("  7. Confirm Tenderly / Forta alerts are wired to this address");
        console.log("");

        // ── Write .deploy.json for VerifyOnEtherscan.sh ──────────────────────
        // Forge does not natively support writing arbitrary JSON mid-script,
        // so we emit the address as a log line that VerifyOnEtherscan.sh can parse.
        // Alternatively, Raymond can read the address from:
        //   broadcast/DeployV2_1_Sepolia.s.sol/421614/run-latest.json
        console.log("DEPLOYED_ADDRESS=", addr);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 len;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory buf = new bytes(len);
        while (v != 0) { buf[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }
}

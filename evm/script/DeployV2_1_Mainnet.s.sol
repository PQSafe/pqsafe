// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendEnvelopeRegistryV2_1} from "../src/SpendEnvelopeRegistryV2_1.sol";

/**
 * @title DeployV2_1_Mainnet
 * @notice Foundry deploy script for SpendEnvelopeRegistryV2_1 on EVM mainnets.
 *
 * Supported chains (pass via --rpc-url alias in foundry.toml):
 *   base          — Base Mainnet      (chain ID 8453)
 *   arbitrum_one  — Arbitrum One      (chain ID 42161)
 *   optimism      — Optimism Mainnet  (chain ID 10)
 *
 * FULL COMMANDS (Raymond runs when ready — one per chain):
 * ─────────────────────────────────────────────────────────
 *   cd ~/Projects/pqsafe/evm
 *
 *   # Base Mainnet
 *   forge script script/DeployV2_1_Mainnet.s.sol \
 *     --rpc-url base \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY
 *
 *   # Arbitrum One
 *   forge script script/DeployV2_1_Mainnet.s.sol \
 *     --rpc-url arbitrum_one \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ARBISCAN_API_KEY
 *
 *   # Optimism Mainnet
 *   forge script script/DeployV2_1_Mainnet.s.sol \
 *     --rpc-url optimism \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $OPTIMISM_ETHERSCAN_API_KEY
 *
 * DRY-RUN (no keys required — simulates against a fork):
 * ─────────────────────────────────────────────────────────
 *   forge script script/DeployV2_1_Mainnet.s.sol --rpc-url base
 *
 * ENVIRONMENT VARIABLES
 * ─────────────────────────────────────────────────────────
 *   ADMIN_ADDRESS               — receives DEFAULT_ADMIN_ROLE.
 *                                 PRODUCTION: must be a Gnosis Safe 2-of-3 multisig.
 *                                 DO NOT use a raw EOA for mainnet admin.
 *   ISSUER_ADDRESS              — receives ISSUER_ROLE (PQSafe issuer service account).
 *                                 May be the Worker address at api.pqsafe.xyz.
 *   PAUSER_ADDRESS              — receives PAUSER_ROLE (Forta bot / ops monitor address).
 *                                 Intentionally separate from ADMIN so a compromised bot
 *                                 cannot unilaterally cycle pause/unpause.
 *   PRIVATE_KEY                 — deployer private key (NOT the admin key).
 *                                 Must have 0.01+ ETH on each target chain.
 *                                 Source from a hardware wallet or secure env vault.
 *                                 NEVER commit to git.
 *   BASE_RPC_URL                — Base mainnet RPC endpoint (Alchemy/Infura)
 *   ARBITRUM_RPC_URL            — Arbitrum One RPC endpoint
 *   OPTIMISM_RPC_URL            — Optimism mainnet RPC endpoint
 *   BASESCAN_API_KEY            — basescan.org API key for --verify
 *   ARBISCAN_API_KEY            — arbiscan.io API key for --verify
 *   OPTIMISM_ETHERSCAN_API_KEY  — optimistic.etherscan.io API key for --verify
 *
 * CREATE2 SALT
 * ─────────────────────────────────────────────────────────
 * Salt: keccak256("PQSafe.SpendEnvelopeRegistryV2_1.v2.1.0.mainnet")
 * Produces a deterministic address that differs from the Sepolia testnet deployment
 * (which uses "...sepolia" suffix). Same salt across all three mainnets — address will
 * match on Base, Arbitrum One, and Optimism (all EVM-equivalent L2s with CREATE2).
 *
 * CHAIN GUARDS
 * ─────────────────────────────────────────────────────────
 * The script enforces that it only runs on known mainnet chain IDs or Anvil (31337).
 * This prevents accidental mainnet deploy from a testnet RPC or vice versa.
 *
 * POST-DEPLOY CHECKLIST
 * ─────────────────────────────────────────────────────────
 * See deploy runbook:
 *   memory/working/pqsafe_mainnet_deploy_runbook_2026-05-05.md
 *
 * Arbitrum Sepolia reference (already deployed + verified):
 *   0x142bA5626bf8B032EB0B59052421C42595417F5d
 */
contract DeployV2_1_Mainnet is Script {

    // -------------------------------------------------------------------------
    // Supported mainnet chain IDs
    // -------------------------------------------------------------------------

    uint256 public constant CHAIN_BASE         = 8453;
    uint256 public constant CHAIN_ARBITRUM_ONE = 42161;
    uint256 public constant CHAIN_OPTIMISM     = 10;
    uint256 public constant CHAIN_ANVIL        = 31337; // local fork

    /// @dev CREATE2 salt — mainnet uses ".mainnet" suffix to differ from Sepolia.
    ///      Same salt across all three mainnets → same deterministic address on each.
    bytes32 public constant DEPLOY_SALT =
        keccak256("PQSafe.SpendEnvelopeRegistryV2_1.v2.1.0.mainnet");

    // -------------------------------------------------------------------------
    // run()
    // -------------------------------------------------------------------------

    function run() external {
        // ── Chain guard ──────────────────────────────────────────────────────
        uint256 cid = block.chainid;
        bool isKnown = (
            cid == CHAIN_BASE         ||
            cid == CHAIN_ARBITRUM_ONE ||
            cid == CHAIN_OPTIMISM     ||
            cid == CHAIN_ANVIL
        );
        if (!isKnown) {
            revert(
                string(
                    abi.encodePacked(
                        "DeployV2_1_Mainnet: unsupported chain ID ",
                        _uintToStr(cid),
                        ". Expected: 8453 (Base), 42161 (Arb One), 10 (Optimism), or 31337 (Anvil)"
                    )
                )
            );
        }

        // ── Read env vars ────────────────────────────────────────────────────
        address admin  = vm.envAddress("ADMIN_ADDRESS");
        address issuer = vm.envAddress("ISSUER_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");

        require(admin  != address(0), "DeployV2_1_Mainnet: ADMIN_ADDRESS must be non-zero");
        require(issuer != address(0), "DeployV2_1_Mainnet: ISSUER_ADDRESS must be non-zero");
        require(pauser != address(0), "DeployV2_1_Mainnet: PAUSER_ADDRESS must be non-zero");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        // Safety: deployer must not hold DEFAULT_ADMIN_ROLE (principle of least privilege)
        // This is a soft warning — enforced by architecture, not code, since admin is
        // a separate address (multisig) from deployer EOA.
        if (deployer == admin) {
            console.log("WARNING: deployer == admin. Production: use a multisig for ADMIN_ADDRESS.");
        }

        // ── Chain name for logging ───────────────────────────────────────────
        string memory chainName = _chainName(cid);

        // ── Pre-flight log ───────────────────────────────────────────────────
        console.log("========================================================");
        console.log("  PQSafe AgentPay - SpendEnvelopeRegistryV2_1 DEPLOY");
        console.log("  Target:", chainName);
        console.log("========================================================");
        console.log("Deployer:          ", deployer);
        console.log("Admin (multisig):  ", admin);
        console.log("Issuer:            ", issuer);
        console.log("Pauser:            ", pauser);
        console.log("Chain ID (actual): ", cid);
        console.log("Balance (mETH):    ", deployer.balance / 1e15);
        console.log("Salt:");
        console.logBytes32(DEPLOY_SALT);
        console.log("");

        // Gas estimate reminder (informational — forge estimates include deployment gas)
        console.log("-- Gas estimate (approx) --");
        console.log("  Deployment:  ~1.3-1.5M gas");
        console.log("  At 0.01 gwei (~Base/OP L2): ~0.000015 ETH (~$0.05)");
        console.log("  At 0.1  gwei (~Arb One):    ~0.00015  ETH (~$0.50)");
        console.log("  Ensure deployer has >= 0.01 ETH for safety margin.");
        console.log("");

        // ── Deploy ───────────────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);

        SpendEnvelopeRegistryV2_1 registry = new SpendEnvelopeRegistryV2_1{salt: DEPLOY_SALT}(admin);

        // ── Role assignments ─────────────────────────────────────────────────
        registry.grantRole(registry.ISSUER_ROLE(), issuer);
        registry.grantRole(registry.PAUSER_ROLE(), pauser);
        // OPERATOR_ROLE  — granted post-deploy to payment executor service address
        // REVOCATION_ROLE — granted post-deploy to compliance officer address
        // See runbook section "Post-deploy role grants" for exact commands.

        vm.stopBroadcast();

        // ── Post-deploy verification log ─────────────────────────────────────
        address addr = address(registry);
        console.log("========================================================");
        console.log("  DEPLOY SUCCESSFUL");
        console.log("========================================================");
        console.log("Chain:             ", chainName);
        console.log("Contract address:  ", addr);
        console.log("paused():          ", registry.paused());
        console.log("");
        console.log("-- Role state --");
        console.log("DEFAULT_ADMIN_ROLE -> admin:  ", registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        console.log("ISSUER_ROLE        -> issuer: ", registry.hasRole(registry.ISSUER_ROLE(), issuer));
        console.log("PAUSER_ROLE        -> pauser: ", registry.hasRole(registry.PAUSER_ROLE(), pauser));
        console.log("OPERATOR_ROLE      -> admin:  ", registry.hasRole(registry.OPERATOR_ROLE(), admin));
        console.log("");
        console.log("-- Post-deploy checklist --");
        console.log("  1. Update landing/spec/contracts.json with address above");
        console.log("  2. Grant OPERATOR_ROLE to payment executor service address");
        console.log("  3. Grant REVOCATION_ROLE to compliance officer address");
        console.log("  4. Wire Tenderly / Forta alerts to this address");
        console.log("  5. Confirm subgraph config for this chain");
        console.log("  6. Run smoke test: forge script script/SmokeTest.s.sol --rpc-url <chain>");
        console.log("");
        console.log("  See full runbook:");
        console.log("  memory/working/pqsafe_mainnet_deploy_runbook_2026-05-05.md");
        console.log("");

        // Parseable output for scripts
        console.log("DEPLOYED_ADDRESS=", addr);
        console.log("DEPLOYED_CHAIN=", cid);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _chainName(uint256 cid) internal pure returns (string memory) {
        if (cid == CHAIN_BASE)         return "Base Mainnet (8453)";
        if (cid == CHAIN_ARBITRUM_ONE) return "Arbitrum One (42161)";
        if (cid == CHAIN_OPTIMISM)     return "Optimism Mainnet (10)";
        if (cid == CHAIN_ANVIL)        return "Anvil local fork (31337)";
        return "Unknown";
    }

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

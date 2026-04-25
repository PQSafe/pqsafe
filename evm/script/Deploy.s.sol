// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SpendEnvelopeRegistry.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:  ", deployer);
        console.log("Chain ID:  ", block.chainid);
        console.log("Balance:   ", deployer.balance / 1e15, "mETH");

        vm.startBroadcast(deployerPrivateKey);
        SpendEnvelopeRegistry registry = new SpendEnvelopeRegistry();
        vm.stopBroadcast();

        console.log("SpendEnvelopeRegistry deployed to:", address(registry));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PermissionRegistry} from "../src/PermissionRegistry.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {MockOracle} from "../src/demo/MockOracle.sol";
import {AgentVault} from "../src/demo/AgentVault.sol";

/// @notice Deploy the Axon demo stack to the EIP-8141 devnet.
/// @dev    DEPLOYER_PRIVATE_KEY is the owner EOA. The agent key is a separate hot key
///         granted a budget after deployment (see the SDK's setup script).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);

        PermissionRegistry registry = new PermissionRegistry();
        MockOracle oracle = new MockOracle(1e18);
        AgentVault vault = new AgentVault(registry, oracle);
        AgentAccount account = new AgentAccount(owner, registry);

        vm.stopBroadcast();

        console.log("owner    ", owner);
        console.log("registry ", address(registry));
        console.log("oracle   ", address(oracle));
        console.log("vault    ", address(vault));
        console.log("account  ", address(account));
        console.log("approver ", account.approver());
    }
}
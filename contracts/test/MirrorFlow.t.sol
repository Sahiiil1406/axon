// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PermissionRegistry} from "../src/PermissionRegistry.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {MirrorAgentAccount} from "../src/MirrorAgentAccount.sol";
import {IntentLib} from "../src/lib/IntentLib.sol";
import {MockOracle} from "../src/demo/MockOracle.sol";
import {AgentVault} from "../src/demo/AgentVault.sol";

/// @dev Beat 5: the same grant, two account designs. After the owner revokes, the
///      live-read account's admission check fails immediately; the mirror keeps
///      acting until the owner pushes a new copy.
contract MirrorFlowTest is Test {
    PermissionRegistry registry;
    MockOracle oracle;
    AgentVault vault;

    AgentAccount live;
    MirrorAgentAccount mirror;

    uint256 constant AGENT_PK = 0xA11CE;
    address agentKey;
    address owner = address(0x0117);

    uint128 constant BUDGET = 0.5 ether;
    uint64 constant EPOCH = 1 days;

    function setUp() public {
        agentKey = vm.addr(AGENT_PK);

        registry = new PermissionRegistry();
        oracle = new MockOracle(1e18);
        vault = new AgentVault(registry, oracle);

        vm.startPrank(owner);
        live = new AgentAccount(owner, registry);
        mirror = new MirrorAgentAccount(owner, registry);
        vm.stopPrank();

        vm.startPrank(owner);
        registry.grantAgent(address(live), agentKey, 1, BUDGET, EPOCH, uint64(block.timestamp + 7 days));
        registry.allow(address(live), address(vault), AgentVault.rebalance.selector);
        registry.grantAgent(address(mirror), agentKey, 1, BUDGET, EPOCH, uint64(block.timestamp + 7 days));
        registry.allow(address(mirror), address(vault), AgentVault.rebalance.selector);
        mirror.syncGrant(_targets(), _selectors());
        vm.stopPrank();

        vm.deal(address(live), 10 ether);
        vm.deal(address(mirror), 10 ether);

        vm.prank(address(live));
        vault.deposit{value: 1 ether}();
        vm.prank(address(mirror));
        vault.deposit{value: 1 ether}();
    }

    function _targets() internal view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(vault);
    }

    function _selectors() internal pure returns (bytes4[] memory selectors) {
        selectors = new bytes4[](1);
        selectors[0] = AgentVault.rebalance.selector;
    }

    function _intent(address account, bytes32 grantHash)
        internal
        view
        returns (IntentLib.Intent memory)
    {
        return IntentLib.Intent({
            target: address(vault),
            selector: AgentVault.rebalance.selector,
            args: abi.encode(0.1 ether, 0.095 ether),
            value: 0,
            spend: 0.1 ether,
            nonce: AgentAccount(payable(account)).intentNonce(),
            deadline: uint64(block.timestamp + 1 hours),
            grantHash: grantHash
        });
    }

    function test_Mirror_AndLive_AgreeWhileTheGrantIsActive() public view {
        assertEq(
            live.checkAuthority(
                _intent(address(live), registry.current(address(live)).grantHash),
                agentKey
            ),
            bytes32(0)
        );
        assertEq(
            mirror.checkAuthority(
                _intent(address(mirror), mirror.mirroredGrant().grantHash),
                agentKey
            ),
            bytes32(0)
        );
    }

    function test_Revocation_IsImmediateForLive_AndInvisibleToMirror() public {
        vm.prank(owner);
        registry.revoke(address(live));
        vm.prank(owner);
        registry.revoke(address(mirror));

        assertEq(
            live.checkAuthority(_intent(address(live), registry.current(address(live)).grantHash), agentKey),
            bytes32("E_GRANT_INACTIVE")
        );
        assertEq(
            mirror.checkAuthority(
                _intent(address(mirror), mirror.mirroredGrant().grantHash),
                agentKey
            ),
            bytes32(0),
            "the mirror still believes the grant is active"
        );
    }

    function test_StaleMirror_StillExecutes() public {
        vm.prank(owner);
        registry.revoke(address(mirror));

        IntentLib.Intent memory i = _intent(address(mirror), mirror.mirroredGrant().grantHash);
        uint256 before = vault.position(address(mirror));

        // The account is both msg.sender and tx.origin, as it is inside frame 1.
        vm.prank(address(mirror), address(mirror));
        mirror.execute(abi.encode(i));

        assertGt(vault.position(address(mirror)), before, "stale mirror acted after revocation");
        assertEq(mirror.intentNonce(), 1);
    }

    function test_OwnerPush_ClosesTheWindow() public {
        vm.prank(owner);
        registry.revoke(address(mirror));
        vm.prank(owner);
        mirror.syncGrant(_targets(), _selectors());

        assertEq(
            mirror.checkAuthority(
                _intent(address(mirror), mirror.mirroredGrant().grantHash),
                agentKey
            ),
            bytes32("E_GRANT_INACTIVE")
        );
    }

    function test_UnsyncedMirror_HasNoGrant() public {
        MirrorAgentAccount fresh;
        vm.prank(owner);
        fresh = new MirrorAgentAccount(owner, registry);

        assertEq(
            fresh.checkAuthority(_intent(address(fresh), bytes32(0)), agentKey),
            bytes32("E_NO_GRANT")
        );
    }

    function test_OnlyOwnerCanSync() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentAccount.NotOwner.selector);
        mirror.syncGrant(_targets(), _selectors());
    }
}

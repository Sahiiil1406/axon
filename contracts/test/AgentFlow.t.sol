// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PermissionRegistry} from "../src/PermissionRegistry.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {IntentLib} from "../src/lib/IntentLib.sol";
import {MockOracle} from "../src/demo/MockOracle.sol";
import {AgentVault} from "../src/demo/AgentVault.sol";

contract AgentFlowTest is Test {
    PermissionRegistry registry;
    MockOracle oracle;
    AgentVault vault;
    AgentAccount account;

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

        vm.prank(owner);
        account = new AgentAccount(owner, registry);

        vm.startPrank(owner);
        registry.grantAgent(address(account), agentKey, 1, BUDGET, EPOCH, uint64(block.timestamp + 7 days));
        registry.allow(address(account), address(vault), AgentVault.rebalance.selector);
        vm.stopPrank();

        vm.deal(address(account), 10 ether);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _intent(address target, bytes4 sel, bytes memory args, uint256 spend)
        internal
        view
        returns (IntentLib.Intent memory i)
    {
        PermissionRegistry.Grant memory g = registry.current(address(account));
        i = IntentLib.Intent({
            target: target,
            selector: sel,
            args: args,
            value: 0,
            spend: spend,
            nonce: account.intentNonce(),
            deadline: uint64(block.timestamp + 1 hours),
            grantHash: g.grantHash
        });
    }

    function _sign(IntentLib.Intent memory i) internal view returns (bytes memory) {
        bytes32 digest = IntentLib.hash(i, address(account), block.chainid);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_PK, digest);
        // Wire format: <y-parity 0/1><r><s>
        return abi.encodePacked(uint8(v - 27), r, s);
    }

    // ------------------------------------------------------------------
    // Registry
    // ------------------------------------------------------------------

    function test_Registry_GrantHashChangesOnEveryMutation() public {
        bytes32 h1 = registry.current(address(account)).grantHash;

        vm.prank(owner);
        bytes32 h2 = registry.allow(address(account), address(vault), AgentVault.withdraw.selector);
        assertTrue(h2 != h1, "allow must bump the hash");

        vm.prank(owner);
        bytes32 h3 = registry.allow(address(account), address(0xBEEF), bytes4(0x12345678));
        assertTrue(h3 != h2, "second allow must bump again");
    }

    function test_Registry_OnlyOwnerCanGrant() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(PermissionRegistry.NotOwner.selector);
        registry.grantAgent(address(account), agentKey, 1, BUDGET, EPOCH, 0);
    }

    // ------------------------------------------------------------------
    // Owner-side policy
    // ------------------------------------------------------------------

    function test_Policy_Ok() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        assertEq(account.checkAuthority(i, agentKey), bytes32(0));
    }

    function test_Policy_BadSig() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        assertEq(account.checkAuthority(i, vm.addr(0xB0B)), bytes32("E_BAD_SIG"));
    }

    function test_Policy_StaleGrant() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);

        vm.prank(owner);
        registry.allow(address(account), address(vault), AgentVault.withdraw.selector);

        assertEq(account.checkAuthority(i, agentKey), bytes32("E_GRANT_STALE"));
    }

    function test_Policy_Revoked() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);

        vm.prank(owner);
        registry.revoke(address(account));

        assertEq(account.checkAuthority(i, agentKey), bytes32("E_GRANT_INACTIVE"));
    }

    function test_Policy_BudgetExceeded() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.6 ether, 0), 0.6 ether);
        assertEq(account.checkSettlement(i), bytes32("E_EPOCH_BUDGET"));
    }

    function test_Policy_TargetDenied() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.withdraw.selector, abi.encode(owner, 0.1 ether), 0.1 ether);
        assertEq(account.checkAuthority(i, agentKey), bytes32("E_TARGET_DENIED"));
    }

    function test_Policy_Expired() public {
        vm.prank(owner);
        registry.grantAgent(address(account), agentKey, 1, BUDGET, EPOCH, uint64(block.timestamp + 1));

        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        vm.warp(block.timestamp + 2 days);

        assertEq(account.checkSettlement(i), bytes32("E_EXPIRED"));
    }

    function test_Policy_WrongNonce() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        i.nonce = 7;
        assertEq(account.checkAuthority(i, agentKey), bytes32("E_NONCE"));
    }

    function test_Settlement_Deadline() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        assertEq(account.checkSettlement(i), bytes32(0));

        vm.warp(block.timestamp + 2 hours);
        assertEq(account.checkSettlement(i), bytes32("E_DEADLINE"));
    }

    function test_Settlement_Ok() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        assertEq(account.checkSettlement(i), bytes32(0));
    }

    function test_Recover() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        bytes memory sig = _sign(i);
        assertEq(account.recoverAgent(i, sig), agentKey);
    }

    /// @dev The account has no in-EVM signature check: `validate` reads the signer
    ///      the node resolved from signature entry 0. Outside a frame transaction
    ///      SIGPARAM halts, which surfaces as a failed delegatecall — proof that the
    ///      probe is a real `0xb4` and not a fallback.
    function test_Validate_RevertsWithoutFrameContext() public {
        IntentLib.Intent memory i = _intent(address(vault), AgentVault.rebalance.selector, abi.encode(0.2 ether, 0), 0.2 ether);
        vm.expectRevert(
            abi.encodeWithSelector(AgentAccount.Rejected.selector, bytes32("E_SIGPARAM_FAILED"))
        );
        account.validate(abi.encode(i));
    }

    /// @dev Catches a typo in the hand-written probe initcode.
    function test_SignerProbe_Bytecode() public view {
        assertEq(
            account.signerProbe().code,
            hex"600035602035b460005260206000f3"
        );
    }

    // ------------------------------------------------------------------
    // Protocol-side policy
    // ------------------------------------------------------------------

    function _fund() internal {
        vm.prank(address(account));
        vault.deposit{value: 1 ether}();
    }

    function test_Vault_Rebalance_Ok() public {
        _fund();
        vm.prank(address(account));
        vault.rebalance(0.2 ether, 0.19 ether);
        assertEq(vault.position(address(account)), 0.2 ether);
    }

    function test_Vault_Rebalance_OracleStale() public {
        _fund();
        vm.warp(block.timestamp + 120);
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AgentVault.Rejected.selector, bytes32("P_ORACLE_STALE")));
        vault.rebalance(0.2 ether, 0);
    }

    function test_Vault_Rebalance_Cooldown() public {
        _fund();
        vm.startPrank(address(account));
        vault.rebalance(0.1 ether, 0.095 ether);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.Rejected.selector, bytes32("P_COOLDOWN")));
        vault.rebalance(0.1 ether, 0.095 ether);
        vm.stopPrank();
    }

    function test_Vault_Rebalance_Slippage() public {
        _fund();
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AgentVault.Rejected.selector, bytes32("P_SLIPPAGE")));
        vault.rebalance(0.2 ether, 0.1 ether); // oracle says 0.2, floor is 0.19
    }

    function test_Vault_Withdraw_ToStranger_RejectedByProtocol() public {
        _fund();

        // The owner *does* allow this selector — see setUp. The protocol still refuses.
        vm.prank(owner);
        registry.allow(address(account), address(vault), AgentVault.withdraw.selector);

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AgentVault.Rejected.selector, bytes32("P_DESTINATION")));
        vault.withdraw(address(0xBAD), 0.1 ether);
    }

    function test_Vault_Withdraw_ToOwner_Ok() public {
        _fund();
        vm.prank(owner);
        registry.allow(address(account), address(vault), AgentVault.withdraw.selector);

        vm.prank(address(account));
        vault.withdraw(owner, 0.1 ether);
        assertEq(owner.balance, 0.1 ether);
    }
}

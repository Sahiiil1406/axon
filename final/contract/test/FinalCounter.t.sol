// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FinalCounter} from "../src/FinalCounter.sol";
import {PermissionRegistry} from "axon/PermissionRegistry.sol";
import {AgentNative} from "axon/AgentNative.sol";

/// @dev Minimal registered account: `PermissionRegistry.registerAccount()` keys off
///      `msg.sender`, so a contract must make the call itself.
contract MockAgentAccount {
    function register(PermissionRegistry registry) external {
        registry.registerAccount(address(this));
    }

    function increment(FinalCounter counter) external returns (FinalCounter.Lane, uint256) {
        return counter.increment();
    }

    function pay(FinalCounter counter) external payable returns (FinalCounter.Lane, uint256) {
        return counter.pay{value: msg.value}();
    }

    function payAmount(FinalCounter counter, uint256 amount)
        external
        payable
        returns (FinalCounter.Lane, uint256)
    {
        return counter.payAmount{value: msg.value}(amount);
    }
}

contract FinalCounterTest is Test {
    PermissionRegistry internal registry;
    FinalCounter internal counter;
    MockAgentAccount internal agent;

    address internal human = address(0xBEEF);

    function setUp() public {
        registry = new PermissionRegistry();
        counter = new FinalCounter(registry);
        agent = new MockAgentAccount();
        agent.register(registry);

        vm.deal(human, 10 ether);
        vm.deal(address(agent), 10 ether);
    }

    function testHumanIncrementAddsOne() public {
        vm.prank(human);
        (FinalCounter.Lane lane, uint256 step) = counter.increment();

        assertEq(uint8(lane), uint8(FinalCounter.Lane.HUMAN));
        assertEq(step, counter.HUMAN_STEP());
        assertEq(counter.humanCount(), 1);
        assertEq(counter.agentCount(), 0);
        assertEq(uint8(counter.lastLane()), uint8(FinalCounter.Lane.HUMAN));
        assertEq(counter.lastCaller(), human);
    }

    function testAgentIncrementAddsTen() public {
        (FinalCounter.Lane lane, uint256 step) = agent.increment(counter);

        assertEq(uint8(lane), uint8(FinalCounter.Lane.AGENT));
        assertEq(step, counter.AGENT_STEP());
        assertEq(counter.humanCount(), 0);
        assertEq(counter.agentCount(), 10);
        assertEq(uint8(counter.lastLane()), uint8(FinalCounter.Lane.AGENT));
        assertEq(counter.lastCaller(), address(agent));
    }

    function testSameEndpointProducesDifferentState() public {
        vm.prank(human);
        counter.increment();
        agent.increment(counter);

        assertEq(counter.humanCount(), 1);
        assertEq(counter.agentCount(), 10);

        (uint256 humanCount, uint256 agentCount,,,,,,) = counter.snapshot();
        assertEq(humanCount, 1);
        assertEq(agentCount, 10);
    }

    function testHumanPaysHumanPrice() public {
        vm.prank(human);
        (FinalCounter.Lane lane, uint256 step) = counter.pay{value: counter.HUMAN_PRICE()}();

        assertEq(uint8(lane), uint8(FinalCounter.Lane.HUMAN));
        assertEq(step, 1);
        assertEq(counter.humanPaid(), counter.HUMAN_PRICE());
        assertEq(counter.humanPayments(), 1);
        assertEq(counter.humanCount(), 1);
        assertEq(counter.agentPaid(), 0);
    }

    function testAgentPaysAgentPrice() public {
        (FinalCounter.Lane lane, uint256 step) = agent.pay{value: counter.AGENT_PRICE()}(counter);

        assertEq(uint8(lane), uint8(FinalCounter.Lane.AGENT));
        assertEq(step, 10);
        assertEq(counter.agentPaid(), counter.AGENT_PRICE());
        assertEq(counter.agentPayments(), 1);
        assertEq(counter.agentCount(), 10);
        assertEq(counter.humanPaid(), 0);
    }

    function testHumanCannotPayAgentPrice() public {
        uint256 humanPrice = counter.HUMAN_PRICE();
        uint256 agentPrice = counter.AGENT_PRICE();

        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(FinalCounter.WrongPayment.selector, humanPrice, agentPrice)
        );
        counter.pay{value: agentPrice}();
    }

    function testAgentCannotPayHumanPrice() public {
        uint256 humanPrice = counter.HUMAN_PRICE();
        uint256 agentPrice = counter.AGENT_PRICE();

        vm.expectRevert(
            abi.encodeWithSelector(FinalCounter.WrongPayment.selector, agentPrice, humanPrice)
        );
        agent.pay{value: humanPrice}(counter);
    }

    function testHumanPaysExplicitAmount() public {
        uint256 amount = 0.05 ether;
        vm.prank(human);
        (FinalCounter.Lane lane, uint256 step) = counter.payAmount{value: amount}(amount);

        assertEq(uint8(lane), uint8(FinalCounter.Lane.HUMAN));
        assertEq(step, 1);
        assertEq(counter.humanPaid(), amount);
        assertEq(counter.humanPayments(), 1);
        assertEq(counter.humanCount(), 1);
    }

    function testAgentPaysExplicitAmount() public {
        uint256 amount = 0.05 ether;
        (FinalCounter.Lane lane, uint256 step) = agent.payAmount{value: amount}(counter, amount);

        assertEq(uint8(lane), uint8(FinalCounter.Lane.AGENT));
        assertEq(step, 10);
        assertEq(counter.agentPaid(), amount);
        assertEq(counter.agentPayments(), 1);
        assertEq(counter.agentCount(), 10);
    }

    function testPayAmountRejectsZero() public {
        vm.prank(human);
        vm.expectRevert(FinalCounter.ZeroAmount.selector);
        counter.payAmount{value: 0}(0);
    }

    function testPayAmountRejectsWrongValue() public {
        uint256 amount = 0.02 ether;
        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(FinalCounter.WrongPayment.selector, amount, amount - 1)
        );
        counter.payAmount{value: amount - 1}(amount);
    }

    function testClassify() public {
        vm.prank(human);
        (FinalCounter.Lane lane, uint256 step, uint256 price) = counter.classify();
        assertEq(uint8(lane), uint8(FinalCounter.Lane.HUMAN));
        assertEq(step, 1);
        assertEq(price, counter.HUMAN_PRICE());

        vm.prank(address(agent));
        (lane, step, price) = counter.classify();
        assertEq(uint8(lane), uint8(FinalCounter.Lane.AGENT));
        assertEq(step, 10);
        assertEq(price, counter.AGENT_PRICE());
    }

    function testValidateAgentAction() public view {
        AgentNative.AgentContext memory ctx = AgentNative.AgentContext({
            account: address(agent),
            agentKey: address(0),
            grantHash: bytes32(0),
            value: counter.AGENT_PRICE(),
            nonce: 0
        });

        (bool ok, bytes32 reason) =
            counter.validateAgentAction(FinalCounter.increment.selector, "", ctx);
        assertTrue(ok);
        assertEq(reason, bytes32(0));

        (ok, reason) = counter.validateAgentAction(FinalCounter.pay.selector, "", ctx);
        assertTrue(ok);
        assertEq(reason, bytes32(0));

        ctx.value = counter.HUMAN_PRICE();
        (ok, reason) = counter.validateAgentAction(FinalCounter.pay.selector, "", ctx);
        assertFalse(ok);
        assertEq(reason, "P_PRICE");

        uint256 amount = 0.05 ether;
        ctx.value = amount;
        (ok, reason) = counter.validateAgentAction(
            FinalCounter.payAmount.selector,
            abi.encode(amount),
            ctx
        );
        assertTrue(ok);
        assertEq(reason, bytes32(0));

        ctx.value = amount - 1;
        (ok, reason) = counter.validateAgentAction(
            FinalCounter.payAmount.selector,
            abi.encode(amount),
            ctx
        );
        assertFalse(ok);
        assertEq(reason, "P_PRICE");
    }

    function testAgentActions() public view {
        bytes4[] memory actions = counter.agentActions();
        assertEq(actions.length, 3);
        assertEq(actions[0], FinalCounter.increment.selector);
        assertEq(actions[1], FinalCounter.pay.selector);
        assertEq(actions[2], FinalCounter.payAmount.selector);
    }
}

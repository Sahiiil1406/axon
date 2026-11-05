// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentNative} from "../AgentNative.sol";
import {PermissionRegistry} from "../PermissionRegistry.sol";
import {MockOracle} from "./MockOracle.sol";

interface IAgentAccount {
    function owner() external view returns (address);
}

/// @title AgentVault
/// @notice Demo protocol with its own opinion about how agents may behave.
/// @dev    The protocol rules here are deliberately *not* the owner's rules:
///
///           - withdraw() may only ever pay the account's owner
///           - rebalance() must respect oracle freshness and a cooldown
///           - slippage is bounded against the oracle, not against what the agent wants
///
///         An owner may grant an agent permission to call `withdraw` to any address.
///         The protocol still refuses. That is the point of two-sided enforcement.
contract AgentVault is AgentNative {
    PermissionRegistry public immutable registry;
    MockOracle public immutable oracle;

    uint256 public constant MAX_TRADE = 1 ether;
    uint256 public constant COOLDOWN = 30 seconds;
    uint256 public constant MAX_ORACLE_AGE = 60 seconds;
    uint256 public constant MAX_SLIPPAGE_BPS = 500; // 5%

    mapping(address account => uint256) public deposits;
    mapping(address account => uint256) public position;
    mapping(address account => uint64) public lastActionAt;

    bytes32 internal constant OK = bytes32(0);
    bytes32 internal constant P_ORACLE_STALE = "P_ORACLE_STALE";
    bytes32 internal constant P_COOLDOWN = "P_COOLDOWN";
    bytes32 internal constant P_SIZE = "P_SIZE";
    bytes32 internal constant P_INSUFFICIENT = "P_INSUFFICIENT";
    bytes32 internal constant P_SLIPPAGE = "P_SLIPPAGE";
    bytes32 internal constant P_DESTINATION = "P_DESTINATION";
    bytes32 internal constant P_UNKNOWN_ACTION = "P_UNKNOWN_ACTION";

    error NotAgent();
    error Rejected(bytes32 reason);

    event Rebalanced(address indexed account, uint256 amount, uint256 out, uint256 price);
    event Withdrawn(address indexed account, address indexed to, uint256 amount);

    constructor(PermissionRegistry registry_, MockOracle oracle_) {
        registry = registry_;
        oracle = oracle_;
    }

    modifier onlyAgent() {
        if (!registry.isAccount(msg.sender)) revert NotAgent();
        _;
    }

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
    }

    // ---------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------

    /// @custom:agent-action rebalance(uint256 amount, uint256 minOut)
    /// @custom:agent-policy max-trade, oracle-freshness, slippage, cooldown
    /// @custom:agent-description Swap deposited ETH for the vault's position at the oracle price.
    function rebalance(uint256 amount, uint256 minOut) external onlyAgent {
        // Time-dependent rules are enforced here, in the body frame. The validation
        // prefix must be time-free: the alt mempool bans TIMESTAMP there.
        if (block.timestamp > oracle.updatedAt() + MAX_ORACLE_AGE) revert Rejected(P_ORACLE_STALE);
        uint64 last = lastActionAt[msg.sender];
        if (last != 0 && block.timestamp < last + COOLDOWN) revert Rejected(P_COOLDOWN);

        bytes memory args = abi.encode(amount, minOut);
        (bool ok, bytes32 reason) = this.validateAgentAction(msg.sig, args, _ctx(msg.sender, amount));
        if (!ok) revert Rejected(reason);

        uint256 out = (amount * oracle.price()) / 1e18;
        deposits[msg.sender] -= amount;
        position[msg.sender] += out;
        lastActionAt[msg.sender] = uint64(block.timestamp);

        emit Rebalanced(msg.sender, amount, out, oracle.price());
    }

    /// @custom:agent-action withdraw(address to, uint256 amount)
    /// @custom:agent-policy destination-is-owner, liquidity
    /// @custom:agent-description Withdraw deposited ETH. The protocol only pays the account owner.
    function withdraw(address to, uint256 amount) external onlyAgent {
        bytes memory args = abi.encode(to, amount);
        (bool ok, bytes32 reason) = this.validateAgentAction(msg.sig, args, _ctx(msg.sender, amount));
        if (!ok) revert Rejected(reason);

        deposits[msg.sender] -= amount;
        lastActionAt[msg.sender] = uint64(block.timestamp);
        (bool sent,) = to.call{value: amount}("");
        require(sent, "send failed");

        emit Withdrawn(msg.sender, to, amount);
    }

    // ---------------------------------------------------------------------
    // Protocol-side admission
    // ---------------------------------------------------------------------

    function validateAgentAction(bytes4 selector, bytes calldata args, AgentContext calldata ctx)
        external
        view
        override
        returns (bool ok, bytes32 reason)
    {
        if (selector == AgentVault.rebalance.selector) {
            return _checkRebalance(args, ctx);
        }
        if (selector == AgentVault.withdraw.selector) {
            return _checkWithdraw(args, ctx);
        }
        return (false, P_UNKNOWN_ACTION);
    }

    function _checkRebalance(bytes calldata args, AgentContext calldata ctx)
        private
        view
        returns (bool, bytes32)
    {
        (uint256 amount, uint256 minOut) = abi.decode(args, (uint256, uint256));

        if (amount == 0 || amount > MAX_TRADE) return (false, P_SIZE);
        if (amount > deposits[ctx.account]) return (false, P_INSUFFICIENT);

        uint256 expected = (amount * oracle.price()) / 1e18;
        uint256 floor = (expected * (10_000 - MAX_SLIPPAGE_BPS)) / 10_000;
        if (minOut < floor) return (false, P_SLIPPAGE);

        return (true, OK);
    }

    function _checkWithdraw(bytes calldata args, AgentContext calldata ctx)
        private
        view
        returns (bool, bytes32)
    {
        (address to, uint256 amount) = abi.decode(args, (address, uint256));

        // The protocol's own rule, independent of anything the owner allowed.
        if (to != IAgentAccount(ctx.account).owner()) return (false, P_DESTINATION);
        if (amount == 0 || amount > deposits[ctx.account]) return (false, P_INSUFFICIENT);

        return (true, OK);
    }

    function agentActions() external pure override returns (bytes4[] memory s) {
        s = new bytes4[](2);
        s[0] = AgentVault.rebalance.selector;
        s[1] = AgentVault.withdraw.selector;
    }

    function _ctx(address account, uint256 value) private view returns (AgentContext memory) {
        return AgentContext({
            account: account,
            agentKey: address(0),
            grantHash: bytes32(0),
            value: value,
            nonce: 0
        });
    }

    receive() external payable {}
}

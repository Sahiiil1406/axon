// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentNative} from "axon/AgentNative.sol";
import {PermissionRegistry} from "axon/PermissionRegistry.sol";

/// @title FinalCounter
/// @notice One counter endpoint that deliberately behaves differently for a human
///         and for an agent.
/// @dev    The lane is decided by the caller, not by calldata:
///
///           - a plain EOA (or a DEFAULT/SENDER frame from an EOA) is `HUMAN`
///           - the registered Axon `AgentAccount` is `AGENT`
///
///         The agent path is a real EIP-8141 two-frame transaction:
///
///           [0] VERIFY  -> AgentAccount.validate() -> this.validateAgentAction()
///           [1] SENDER  -> AgentAccount.execute()  -> this.increment() / this.pay()
///
///         `increment()` and `pay()` are the same endpoints for both lanes. Only the
///         caller's classification changes the step and the price. That makes the
///         difference visible in one transaction without a second ABI.
contract FinalCounter is AgentNative {
    enum Lane {
        HUMAN,
        AGENT
    }

    /// @dev The human and agent lanes move by different amounts, so the same call
    ///      produces an obvious state difference.
    uint256 public constant HUMAN_STEP = 1;
    uint256 public constant AGENT_STEP = 10;

    /// @dev The agent gets a 10x discount on `pay()`. Both prices are intentionally
    ///      tiny so the devnet account can exercise the path repeatedly.
    uint256 public constant HUMAN_PRICE = 0.001 ether;
    uint256 public constant AGENT_PRICE = 0.0001 ether;

    bytes32 internal constant OK = bytes32(0);
    bytes32 internal constant P_PRICE = "P_PRICE";
    bytes32 internal constant P_AMOUNT = "P_AMOUNT";
    bytes32 internal constant P_UNKNOWN_ACTION = "P_UNKNOWN_ACTION";

    PermissionRegistry public immutable registry;

    uint256 public humanCount;
    uint256 public agentCount;
    uint256 public humanPaid;
    uint256 public agentPaid;
    uint256 public humanPayments;
    uint256 public agentPayments;

    address public lastCaller;
    Lane public lastLane;

    event Incremented(
        address indexed caller,
        Lane indexed lane,
        uint256 step,
        uint256 humanCount,
        uint256 agentCount
    );
    event Paid(
        address indexed caller,
        Lane indexed lane,
        uint256 amount,
        uint256 step,
        uint256 humanCount,
        uint256 agentCount
    );

    error WrongPayment(uint256 expected, uint256 actual);
    error ZeroAmount();
    error Rejected(bytes32 reason);

    constructor(PermissionRegistry registry_) {
        registry = registry_;
    }

    // ---------------------------------------------------------------------
    // The two shared endpoints
    // ---------------------------------------------------------------------

    /// @notice Advance the caller's lane. Humans add 1, agents add 10.
    /// @return lane The classified lane.
    /// @return step The amount added to that lane's counter.
    function increment() external returns (Lane lane, uint256 step) {
        lane = laneOf(msg.sender);
        step = lane == Lane.AGENT ? AGENT_STEP : HUMAN_STEP;

        if (lane == Lane.AGENT) {
            agentCount += step;
        } else {
            humanCount += step;
        }

        _record(msg.sender, lane);
        emit Incremented(msg.sender, lane, step, humanCount, agentCount);
    }

    /// @notice Pay at the caller's lane price and advance that lane.
    /// @dev    Humans pay 0.001 ETH; agents pay 0.0001 ETH. The lane is not supplied
    ///         by the caller, so an EOA cannot ask for the agent price.
    function pay() external payable returns (Lane lane, uint256 step) {
        lane = laneOf(msg.sender);
        uint256 expected = lane == Lane.AGENT ? AGENT_PRICE : HUMAN_PRICE;
        if (msg.value != expected) revert WrongPayment(expected, msg.value);

        step = lane == Lane.AGENT ? AGENT_STEP : HUMAN_STEP;

        if (lane == Lane.AGENT) {
            agentPaid += msg.value;
            agentPayments += 1;
            agentCount += step;
        } else {
            humanPaid += msg.value;
            humanPayments += 1;
            humanCount += step;
        }

        _record(msg.sender, lane);
        emit Paid(msg.sender, lane, msg.value, step, humanCount, agentCount);
    }

    /// @notice Pay an explicit amount. The same endpoint is used by both lanes;
    ///         the lane still decides whether the counter advances by 1 or 10.
    /// @dev    This is the endpoint the permission demo uses: for an agent, the
    ///         intent's `spend` equals `amount`, so a payment above the grant's
    ///         remaining epoch budget reverts in the account's SENDER frame with
    ///         `E_EPOCH_BUDGET` before this function is reached.
    function payAmount(uint256 amount) external payable returns (Lane lane, uint256 step) {
        if (amount == 0) revert ZeroAmount();
        if (msg.value != amount) revert WrongPayment(amount, msg.value);

        lane = laneOf(msg.sender);
        step = lane == Lane.AGENT ? AGENT_STEP : HUMAN_STEP;

        if (lane == Lane.AGENT) {
            agentPaid += amount;
            agentPayments += 1;
            agentCount += step;
        } else {
            humanPaid += amount;
            humanPayments += 1;
            humanCount += step;
        }

        _record(msg.sender, lane);
        emit Paid(msg.sender, lane, amount, step, humanCount, agentCount);
    }

    // ---------------------------------------------------------------------
    // Classification and read helpers
    // ---------------------------------------------------------------------

    /// @notice The lane a caller would get. `AGENT` means the caller is a registered
    ///         Axon account; everything else is `HUMAN`.
    function laneOf(address caller) public view returns (Lane) {
        return registry.isAccount(caller) ? Lane.AGENT : Lane.HUMAN;
    }

    /// @notice What the *current caller* would do, without changing state.
    function classify() external view returns (Lane lane, uint256 step, uint256 price) {
        lane = laneOf(msg.sender);
        step = lane == Lane.AGENT ? AGENT_STEP : HUMAN_STEP;
        price = lane == Lane.AGENT ? AGENT_PRICE : HUMAN_PRICE;
    }

    /// @notice One call for a demo UI or a `cast call`.
    function snapshot()
        external
        view
        returns (
            uint256 humanCount_,
            uint256 agentCount_,
            uint256 humanPaid_,
            uint256 agentPaid_,
            uint256 humanPayments_,
            uint256 agentPayments_,
            Lane lastLane_,
            address lastCaller_
        )
    {
        return (
            humanCount,
            agentCount,
            humanPaid,
            agentPaid,
            humanPayments,
            agentPayments,
            lastLane,
            lastCaller
        );
    }

    // ---------------------------------------------------------------------
    // Protocol-side admission for the agent's VERIFY frame
    // ---------------------------------------------------------------------

    /// @dev Called by `AgentAccount.validate()` inside frame 0. A false return (or a
    ///      reverting call) blocks the whole frame transaction before payment.
    function validateAgentAction(bytes4 selector, bytes calldata args, AgentContext calldata ctx)
        external
        pure
        override
        returns (bool ok, bytes32 reason)
    {
        if (selector == FinalCounter.increment.selector) {
            return (true, OK);
        }
        if (selector == FinalCounter.pay.selector) {
            if (ctx.value != AGENT_PRICE) return (false, P_PRICE);
            return (true, OK);
        }
        if (selector == FinalCounter.payAmount.selector) {
            uint256 amount = abi.decode(args, (uint256));
            if (amount == 0) return (false, P_AMOUNT);
            if (ctx.value != amount) return (false, P_PRICE);
            return (true, OK);
        }
        return (false, P_UNKNOWN_ACTION);
    }

    function agentActions() external pure override returns (bytes4[] memory selectors) {
        selectors = new bytes4[](3);
        selectors[0] = FinalCounter.increment.selector;
        selectors[1] = FinalCounter.pay.selector;
        selectors[2] = FinalCounter.payAmount.selector;
    }

    function _record(address caller, Lane lane) internal {
        lastCaller = caller;
        lastLane = lane;
    }
}

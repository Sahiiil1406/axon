// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentNative
/// @notice The protocol developer's side of the authority split.
/// @dev    A contract inheriting this declares which actions an agent may call and what
///         its own admission conditions are. The account calls `validateAgentAction`
///         from inside its VERIFY frame, so the protocol's rules are enforced *before*
///         payment and before execution — not merely inside the action itself.
abstract contract AgentNative {
    struct AgentContext {
        address account;
        address agentKey;
        bytes32 grantHash;
        uint256 value;
        uint256 nonce;
    }

    /// @notice Cheap, side-effect-free admission predicate.
    /// @return ok     false to reject
    /// @return reason a bytes32 code, surfaced verbatim in the admission report
    function validateAgentAction(bytes4 selector, bytes calldata args, AgentContext calldata ctx)
        external
        view
        virtual
        returns (bool ok, bytes32 reason);

    /// @notice Declarative surface, consumed by codegen to build the SDK and LLM tools.
    function agentActions() external view virtual returns (bytes4[] memory selectors);
}

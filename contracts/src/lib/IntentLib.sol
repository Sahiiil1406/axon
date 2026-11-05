// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentLib
/// @notice The signed intent an agent submits inside a frame transaction.
/// @dev    An intent is *not* a transaction. It is the agent's claim about what it
///         wants to do; the account decides whether that claim is admissible.
library IntentLib {
    /// @dev Bumped whenever the struct changes. Included in the digest so an old
    ///      signature can never be replayed against a new layout.
    bytes32 internal constant INTENT_TYPEHASH = keccak256(
        "Intent(address account,uint256 chainId,address target,bytes4 selector,bytes32 argsHash,uint256 value,uint256 spend,uint256 nonce,uint64 deadline,bytes32 grantHash)"
    );

    struct Intent {
        address target; // protocol contract
        bytes4 selector; // agent-callable action
        bytes args; // abi-encoded action arguments
        uint256 value; // wei forwarded with the call
        uint256 spend; // budget consumed, in the owner's chosen unit
        uint256 nonce; // per-account intent nonce
        uint64 deadline; // unix seconds
        bytes32 grantHash; // the grant version the agent saw
    }

    /// @notice Digest the agent signs. Bound to this account and this chain.
    function hash(Intent memory i, address account, uint256 chainId) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                account,
                chainId,
                i.target,
                i.selector,
                keccak256(i.args),
                i.value,
                i.spend,
                i.nonce,
                i.deadline,
                i.grantHash
            )
        );
    }
}

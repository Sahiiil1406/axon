// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "./AgentAccount.sol";
import {PermissionRegistry} from "./PermissionRegistry.sol";

/// @title MirrorAgentAccount
/// @notice The same agent account, except it copies its grant into local storage.
/// @dev    This is the trade-off the live-read `AgentAccount` refuses to make.
///
///           - Cheap and public-mempool-legal: every authority check is a local
///             `SLOAD`, so validation never touches foreign storage.
///           - Revocation is only as fast as the last `syncGrant`: the owner must
///             push the new grant, and an intent signed against the old one stays
///             valid until they do.
///
///         `syncGrant` is the owner's push. It copies the grant and the allowlist
///         entries the owner names. Nothing refreshes automatically — that omission
///         is the demo.
contract MirrorAgentAccount is AgentAccount {
    PermissionRegistry.Grant private _mirrored;
    mapping(address target => mapping(bytes4 selector => bool)) private _mirroredAllowed;

    /// @notice Block timestamp of the last owner push.
    uint64 public mirroredAt;

    event GrantMirrored(bytes32 grantHash, uint256 version, uint64 at);

    error BadSync();

    constructor(address owner_, PermissionRegistry registry_) AgentAccount(owner_, registry_) {}

    /// @notice Copy the registry's current grant and the named allowlist entries.
    /// @dev Owner-only. Call again after any grant change to close the staleness window.
    function syncGrant(address[] calldata targets, bytes4[] calldata selectors) external {
        if (msg.sender != owner) revert NotOwner();
        if (targets.length != selectors.length) revert BadSync();

        PermissionRegistry.Grant memory g = registry.current(address(this));
        _mirrored = g;
        for (uint256 i = 0; i < targets.length; i++) {
            _mirroredAllowed[targets[i]][selectors[i]] =
                registry.isAllowed(address(this), targets[i], selectors[i]);
        }

        mirroredAt = uint64(block.timestamp);
        emit GrantMirrored(g.grantHash, g.version, mirroredAt);
    }

    /// @notice The grant this account is actually enforcing.
    function mirroredGrant() external view returns (PermissionRegistry.Grant memory) {
        return _mirrored;
    }

    /// @notice The local allowlist entry this account is actually enforcing.
    function mirroredAllowed(address target, bytes4 selector) external view returns (bool) {
        return _mirroredAllowed[target][selector];
    }

    function _grant() internal view override returns (PermissionRegistry.Grant memory) {
        return _mirrored;
    }

    function _allowed(address target, bytes4 selector) internal view override returns (bool) {
        return _mirroredAllowed[target][selector];
    }
}

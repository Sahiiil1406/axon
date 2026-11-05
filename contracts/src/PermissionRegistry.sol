// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PermissionRegistry
/// @notice The owner's side of the authority split.
/// @dev    This contract is deliberately *separate* from the agent account. Reading it
///         from a validation frame is a foreign `SLOAD`, which the EIP-8141 public
///         mempool forbids. That is the point: the grant is read live, so revocation is
///         immediate and there is no stale mirror to sync.
contract PermissionRegistry {
    struct Grant {
        address owner;
        address agentKey;
        uint8 keyScheme; // 1 = SECP256K1, 2 = P256
        uint128 budgetPerEpoch;
        uint64 epochLength;
        uint64 expiresAt;
        bool active;
        uint256 version;
        bytes32 grantHash;
    }

    error NotOwner();
    error AlreadyRegistered();
    error NoGrant();
    error BadInput();

    event AccountRegistered(address indexed account, address indexed owner);
    event AgentGranted(address indexed account, address indexed agentKey, bytes32 grantHash);
    event GrantUpdated(address indexed account, bytes32 grantHash);
    event AgentRevoked(address indexed account);

    mapping(address account => Grant) private _grants;
    mapping(address account => bool) public isAccount;
    // account => target => selector => allowed
    mapping(address => mapping(address => mapping(bytes4 => bool))) public allowed;

    /// @notice Register a deployed agent account. Called once, by the account itself
    ///         during deployment, so the registry can recognise it as a protocol caller.
    function registerAccount(address owner) external {
        if (isAccount[msg.sender]) revert AlreadyRegistered();
        isAccount[msg.sender] = true;
        _grants[msg.sender].owner = owner;
        emit AccountRegistered(msg.sender, owner);
    }

    /// @notice Owner grants an agent key a budget, an epoch and an expiry.
    function grantAgent(
        address account,
        address agentKey,
        uint8 keyScheme,
        uint128 budgetPerEpoch,
        uint64 epochLength,
        uint64 expiresAt
    ) external returns (bytes32 grantHash) {
        Grant storage g = _grants[account];
        if (g.owner != msg.sender) revert NotOwner();
        if (agentKey == address(0) || epochLength == 0) revert BadInput();

        g.agentKey = agentKey;
        g.keyScheme = keyScheme;
        g.budgetPerEpoch = budgetPerEpoch;
        g.epochLength = epochLength;
        g.expiresAt = expiresAt;
        g.active = true;

        grantHash = _bump(g);
        emit AgentGranted(account, agentKey, grantHash);
    }

    /// @notice Allow a target + selector pair. Any mutation invalidates in-flight intents.
    function allow(address account, address target, bytes4 selector) external returns (bytes32) {
        Grant storage g = _grants[account];
        if (g.owner != msg.sender) revert NotOwner();
        allowed[account][target][selector] = true;
        return _bump(g);
    }

    function disallow(address account, address target, bytes4 selector) external returns (bytes32) {
        Grant storage g = _grants[account];
        if (g.owner != msg.sender) revert NotOwner();
        allowed[account][target][selector] = false;
        return _bump(g);
    }

    /// @notice Kill switch. Pending intents fail their grant-freshness check immediately.
    function revoke(address account) external {
        Grant storage g = _grants[account];
        if (g.owner != msg.sender) revert NotOwner();
        g.active = false;
        _bump(g);
        emit AgentRevoked(account);
    }

    function current(address account) external view returns (Grant memory) {
        return _grants[account];
    }

    function isAllowed(address account, address target, bytes4 selector) external view returns (bool) {
        return allowed[account][target][selector];
    }

    /// @dev Recomputes the grant hash from live state plus a version counter, so any
    ///      mutation — including allowlist edits — produces a new hash.
    function _bump(Grant storage g) private returns (bytes32 h) {
        g.version += 1;
        h = keccak256(
            abi.encode(
                g.owner,
                g.agentKey,
                g.keyScheme,
                g.budgetPerEpoch,
                g.epochLength,
                g.expiresAt,
                g.active,
                g.version
            )
        );
        g.grantHash = h;
    }
}

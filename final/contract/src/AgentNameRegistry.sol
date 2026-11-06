// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Axon's owner-managed text records for agent DNS-style names.
contract AgentNameRegistry {
    error Unauthorized();
    error InvalidName();

    address public immutable owner;
    mapping(string name => mapping(string key => string value)) private records;

    event TextChanged(string indexed indexedName, string name, string key, string value);

    constructor() {
        owner = msg.sender;
    }

    function setText(string calldata name, string calldata key, string calldata value) external {
        if (msg.sender != owner) revert Unauthorized();
        if (bytes(name).length == 0) revert InvalidName();
        records[name][key] = value;
        emit TextChanged(name, name, key, value);
    }

    function text(string calldata name, string calldata key) external view returns (string memory) {
        return records[name][key];
    }
}

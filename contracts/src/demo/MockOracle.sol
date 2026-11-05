// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockOracle
/// @notice Stand-in price feed for the demo. Real deployments read a live feed; the
///         point for us is that reading it is a foreign `SLOAD` at validation time.
contract MockOracle {
    uint256 public price; // token units per 1 wei, scaled 1e18
    uint64 public updatedAt;

    constructor(uint256 price_) {
        price = price_;
        updatedAt = uint64(block.timestamp);
    }

    function setPrice(uint256 price_) external {
        price = price_;
        updatedAt = uint64(block.timestamp);
    }

    function poke() external {
        updatedAt = uint64(block.timestamp);
    }
}

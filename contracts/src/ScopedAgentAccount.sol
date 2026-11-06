// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "./AgentAccount.sol";
import {PermissionRegistry} from "./PermissionRegistry.sol";
import {IntentLib} from "./lib/IntentLib.sol";

interface IScopedPermissionVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata signals
    ) external view returns (bool);
}

/// @notice Agent account variant using owner-committed private FinalCounter rules.
contract ScopedAgentAccount is AgentAccount {
    uint256 internal constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes4 private constant INCREMENT = bytes4(keccak256("increment()"));
    bytes4 private constant PAY_AMOUNT = bytes4(keccak256("payAmount(uint256)"));

    IScopedPermissionVerifier public immutable verifier;
    address public immutable counter;
    uint256 public policyRoot;

    struct ScopedProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256 binding;
    }

    event PolicyRootSet(uint256 root);

    constructor(address owner_, PermissionRegistry registry_, IScopedPermissionVerifier verifier_, address counter_)
        AgentAccount(owner_, registry_)
    {
        require(address(verifier_).code.length != 0 && counter_.code.length != 0, "missing deployment");
        verifier = verifier_;
        counter = counter_;
    }

    /// @notice Setting the root to zero disables private policy execution.
    function setPolicyRoot(uint256 root) external {
        if (msg.sender != owner) revert NotOwner();
        require(root < FIELD, "root out of field");
        policyRoot = root;
        emit PolicyRootSet(root);
    }

    function scopeFor(address agentKey, bytes4 selector) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), counter, agentKey, selector))) % FIELD;
    }

    function _allowed(address target, bytes4 selector) internal view override returns (bool) {
        return target == counter && (selector == INCREMENT || selector == PAY_AMOUNT);
    }

    function _checkExecutionPolicy(IntentLib.Intent memory intent, bytes calldata data) internal view override {
        if (policyRoot == 0 || !_allowed(intent.target, intent.selector))
            revert Rejected("E_PRIVATE_POLICY");
        if (intent.selector == INCREMENT) {
            if (intent.args.length != 0 || intent.value != 0) revert Rejected("E_PRIVATE_SCOPE");
        } else {
            if (intent.args.length != 32 || abi.decode(intent.args, (uint256)) != intent.value)
                revert Rejected("E_PRIVATE_SCOPE");
        }
        // The frame builder ABI-encodes (Intent, ScopedProof). The base account
        // decodes the first tuple and binds both frames to the exact same bytes.
        (, ScopedProof memory proof) = abi.decode(data, (IntentLib.Intent, ScopedProof));
        uint256[5] memory signals = [
            proof.binding, policyRoot, scopeFor(_grant().agentKey, intent.selector), intent.nonce, intent.value
        ];
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, signals)) revert Rejected("E_PRIVATE_PROOF");
    }
}

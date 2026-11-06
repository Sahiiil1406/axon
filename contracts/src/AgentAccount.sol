// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IntentLib} from "./lib/IntentLib.sol";
import {PermissionRegistry} from "./PermissionRegistry.sol";
import {AgentNative} from "./AgentNative.sol";

/// @title AgentAccount
/// @notice A frame-transaction sender whose validity is decided by its own code.
/// @dev    Two frames drive this contract:
///
///           [0] VERIFY  flags=0x3  target=sender  data=validate(...)
///           [1] SENDER  flags=0x0  target=sender  data=execute(...)
///
///         Frame 0 is the standard `self_verify` shape every frame transaction needs —
///         identity plus `APPROVE`. Frame 1 is the agent-specific part: it calls the
///         protocol and settles the spend counter.
///
///         The account deliberately reads `PermissionRegistry` live rather than mirroring
///         the grant into its own storage. That foreign read is what makes this
///         transaction inadmissible to the EIP-8141 public mempool, and it is also what
///         makes revocation instant.
contract AgentAccount {
    using IntentLib for IntentLib.Intent;

    /// @dev APPROVE instruction scope operands.
    uint256 internal constant APPROVE_EXECUTION_AND_PAYMENT = 0x3;

    // Admission reason codes. Returned, never thrown, so the simulator can report them.
    bytes32 internal constant OK = bytes32(0);
    bytes32 internal constant E_NO_GRANT = "E_NO_GRANT";
    bytes32 internal constant E_GRANT_INACTIVE = "E_GRANT_INACTIVE";
    bytes32 internal constant E_GRANT_STALE = "E_GRANT_STALE";
    bytes32 internal constant E_EXPIRED = "E_EXPIRED";
    bytes32 internal constant E_DEADLINE = "E_DEADLINE";
    bytes32 internal constant E_NONCE = "E_NONCE";
    bytes32 internal constant E_TARGET_DENIED = "E_TARGET_DENIED";
    bytes32 internal constant E_EPOCH_BUDGET = "E_EPOCH_BUDGET";
    bytes32 internal constant E_FRAME_SHAPE = "E_FRAME_SHAPE";
    bytes32 internal constant E_SPEND_VALUE = "E_SPEND_VALUE";
    bytes32 internal constant E_BAD_SIG = "E_BAD_SIG";
    bytes32 internal constant E_SIGPARAM_FAILED = "E_SIGPARAM_FAILED";
    bytes32 internal constant E_NOT_FRAME = "E_NOT_FRAME";
    bytes32 internal constant E_PROTOCOL = "E_PROTOCOL";
    bytes32 internal constant E_CALL_FAILED = "E_CALL_FAILED";
    bytes32 internal constant E_APPROVE_FAILED = "E_APPROVE_FAILED";

    address public immutable owner;
    PermissionRegistry public immutable registry;
    uint256 public immutable chainId;

    /// @dev Tiny stub whose runtime code is `CALLDATALOAD(0) PUSH0 PUSH0 APPROVE`.
    ///      Solidity's inline assembly cannot emit opcode `0xaa`, so the account
    ///      delegatecalls into this instead. DELEGATECALL preserves `ADDRESS`, so the
    ///      spec's `ADDRESS == resolved_target` check still passes, and the approval
    ///      context is transaction-scoped regardless of which frame set it.
    address public immutable approver;

    /// @dev Tiny stub whose runtime code reads `(param, signatureIndex)` from calldata
    ///      and returns `SIGPARAM(param, signatureIndex)`. Same reason as `approver`:
    ///      `0xb4` cannot be emitted from Solidity inline assembly.
    ///
    ///      This is how the account learns who authorised the transaction. The agent's
    ///      secp256k1 signature lives in the transaction's `signatures` list with an
    ///      explicit `signer`, so the node verifies it *outside* the EVM. Reading
    ///      `SIGPARAM_RESOLVED_SIGNER` (param `0x00`) is a 2-gas stack read — no
    ///      `ecrecover` precompile, which this devnet's validation trace rejects because
    ///      its precompile list is empty.
    address public immutable signerProbe;
    address public immutable frameProbe;

    /// @dev Signature index of the agent witness. Entry 0 is the agent's SECP256K1
    ///      signature; entry 1 is the sender's ARBITRARY entry. Reordering the list
    ///      changes the canonical signature hash, which invalidates the agent's
    ///      signature, so the index is safe to pin.
    uint256 internal constant AGENT_SIGNATURE_INDEX = 0;

    /// @dev `SIGPARAM_RESOLVED_SIGNER`.
    uint256 internal constant SIGPARAM_RESOLVED_SIGNER = 0x00;

    /// @notice Next intent nonce. Incremented on execution, not on validation.
    uint256 public intentNonce;

    /// @notice Wei spent per policy epoch.
    mapping(uint256 epoch => uint256 spent) public spentInEpoch;

    event AgentActionExecuted(
        address indexed agentKey,
        address indexed target,
        bytes4 indexed selector,
        uint256 value,
        bytes32 grantHash,
        uint256 nonce
    );

    error NotSelf();
    error NotOwner();
    error Rejected(bytes32 reason);

    constructor(address owner_, PermissionRegistry registry_) {
        owner = owner_;
        registry = registry_;
        chainId = block.chainid;

        // initcode: copy 6 bytes of runtime from offset 12, return them
        bytes memory init = hex"6006600c60003960066000f36000355f5faa";
        address a;
        assembly {
            a := create(0, add(init, 0x20), mload(init))
        }
        require(a != address(0), "approver deploy failed");
        approver = a;

        // Runtime: `CALLDATALOAD(0) CALLDATALOAD(32) SIGPARAM MSTORE(0) RETURN(0, 32)`.
        // Initcode copies 15 bytes from offset 12.
        bytes memory probeInit =
            hex"600f600c600039600f6000f3600035602035b460005260206000f3";
        address p;
        assembly {
            p := create(0, add(probeInit, 0x20), mload(probeInit))
        }
        require(p != address(0), "signer probe deploy failed");
        signerProbe = p;

        // Return frame count, frame 1 target/mode/flags/value/length, calldata hash,
        // signature message and canonical signature hash. The calldata argument
        // bounds the copy to the expected execute payload length.
        bytes memory frameInit = hex"6051600c60003960516000f36009b05f525f6001b360205260026001b360405260036001b360605260086001b360805260046001b360a05260015f355f610140b25f356101402060c05260025fb460e0526008b0610100526101205ff3";
        address f;
        assembly {
            f := create(0, add(frameInit, 0x20), mload(frameInit))
        }
        require(f != address(0), "frame probe deploy failed");
        frameProbe = f;

        registry_.registerAccount(owner_);
    }

    // ---------------------------------------------------------------------
    // Frame 0 — VERIFY (the default `self_verify` shape)
    // ---------------------------------------------------------------------

    /// @notice Validate the intent and approve execution + payment.
    /// @dev Runs as a STATICCALL. Must not revert on a *valid* intent; must revert on an
    ///      invalid one, because a reverting VERIFY frame invalidates the whole
    ///      transaction.
    ///
    ///      This function is deliberately **time-free**. The alt mempool's validation
    ///      trace bans `TIMESTAMP` (and `ORIGIN`) for the validation prefix, even for a
    ///      staked entity. Deadlines and epoch budgets therefore settle in `execute`;
    ///      a violation there reverts the whole transaction, so the action still cannot
    ///      exceed its grant.
    ///
    ///      It is also **precompile-free**: the agent's authority comes from the frame
    ///      transaction's own signature list, not from an in-EVM `ecrecover`. The
    ///      agent's `SECP256K1` entry carries an explicit `signer`, so the node
    ///      authenticates it before any frame runs; `validate` only reads the resolved
    ///      address back out with `SIGPARAM`.
    function validate(bytes calldata data) external {
        IntentLib.Intent memory i = abi.decode(data, (IntentLib.Intent));

        address agentKey = _resolvedSigner(AGENT_SIGNATURE_INDEX);
        bytes32 reason = checkAuthority(i, agentKey);
        if (reason != OK) revert Rejected(reason);

        // Ask the protocol for admission, still inside validation. This is the second
        // half of the authority split: the protocol's rules run before payment.
        (bool ok, bytes32 protocolReason) = AgentNative(i.target).validateAgentAction(
            i.selector,
            i.args,
            AgentNative.AgentContext({
                account: address(this),
                agentKey: agentKey,
                grantHash: i.grantHash,
                value: i.value,
                nonce: i.nonce
            })
        );
        if (!ok) revert Rejected(protocolReason);

        _checkExecutionFrame(data);

        // Only now does the account commit.
        _approve(APPROVE_EXECUTION_AND_PAYMENT);
    }

    // ---------------------------------------------------------------------
    // Frame 1 — SENDER (the agent-specific frame)
    // ---------------------------------------------------------------------

    /// @notice Execute the approved action and settle the budget.
    /// @dev Runs with caller == tx.sender, so ORIGIN == address(this). A direct EOA call
    ///      therefore reverts, which is the guard that keeps this reachable only through
    ///      a frame transaction.
    function execute(bytes calldata data) external {
        if (tx.origin != address(this)) revert NotSelf();

        IntentLib.Intent memory i = abi.decode(data, (IntentLib.Intent));

        // Time-dependent settlement rules live here, outside the validation trace.
        bytes32 reason = checkSettlement(i);
        if (reason != OK) revert Rejected(reason);

        PermissionRegistry.Grant memory g = _grant();
        uint256 epoch = block.timestamp / g.epochLength;

        // Re-check the nonce: frame 0 validated it, but only execution advances it.
        if (i.nonce != intentNonce) revert Rejected(E_NONCE);

        _checkExecutionPolicy(i, data);

        intentNonce = i.nonce + 1;
        spentInEpoch[epoch] += i.spend;

        (bool ok,) = i.target.call{value: i.value}(abi.encodePacked(i.selector, i.args));
        if (!ok) revert Rejected(E_CALL_FAILED);

        emit AgentActionExecuted(_agentKeyCached(), i.target, i.selector, i.value, i.grantHash, i.nonce);
    }

    // ---------------------------------------------------------------------
    // Policy — pure, so it is unit-testable without a frame context
    // ---------------------------------------------------------------------

    /// @notice Mempool-verifiable authority rules. Returns OK or a reason code.
    /// @dev    Reads `PermissionRegistry` (foreign storage, admitted by the staked
    ///         carve-out) but never `block.timestamp`.
    function _checkExecutionPolicy(IntentLib.Intent memory, bytes calldata) internal view virtual {}

    function checkAuthority(IntentLib.Intent memory i, address agentKey) public view returns (bytes32) {
        PermissionRegistry.Grant memory g = _grant();

        if (g.owner == address(0) || g.agentKey == address(0)) return E_NO_GRANT;
        if (!g.active) return E_GRANT_INACTIVE;
        if (agentKey != g.agentKey) return E_BAD_SIG;
        if (i.grantHash != g.grantHash) return E_GRANT_STALE;
        if (i.nonce != intentNonce) return E_NONCE;
        if (!_allowed(i.target, i.selector)) return E_TARGET_DENIED;
        if (i.spend < i.value) return E_SPEND_VALUE;

        return OK;
    }

    /// @notice Time- and budget-dependent rules, enforced in the body frame.
    /// @dev    Called from `execute`, after the transaction has paid. Reverting here
    ///         reverts the whole frame transaction, so these are still hard constraints.
    function checkSettlement(IntentLib.Intent memory i) public view returns (bytes32) {
        PermissionRegistry.Grant memory g = _grant();

        if (g.epochLength == 0) return E_NO_GRANT;
        if (g.expiresAt != 0 && block.timestamp > g.expiresAt) return E_EXPIRED;
        if (i.deadline != 0 && block.timestamp > i.deadline) return E_DEADLINE;

        uint256 epoch = block.timestamp / g.epochLength;
        if (spentInEpoch[epoch] + i.spend > g.budgetPerEpoch) return E_EPOCH_BUDGET;

        return OK;
    }

    /// @notice Recover the agent key that signed an intent. Exposed for the SDK and tests.
    function recoverAgent(IntentLib.Intent calldata i, bytes calldata signature) external view returns (address) {
        return _recover(i, signature);
    }

    /// @notice Remaining budget in the current epoch. Used by the agent's tool loop.
    function remainingBudget() external view returns (uint256) {
        PermissionRegistry.Grant memory g = _grant();
        if (g.epochLength == 0) return 0;
        uint256 epoch = block.timestamp / g.epochLength;
        uint256 spent = spentInEpoch[epoch];
        return spent >= g.budgetPerEpoch ? 0 : g.budgetPerEpoch - spent;
    }

    // ---------------------------------------------------------------------
    // Owner operations — setup and the staking carve-out
    // ---------------------------------------------------------------------

    /// @notice Owner-only escape hatch used to set up the demo (e.g. deposit into the
    ///         vault as the account). Never reachable from a frame transaction.
    function setupCall(address target, uint256 value, bytes calldata data) external {
        if (msg.sender != owner) revert NotOwner();
        (bool ok,) = target.call{value: value}(data);
        require(ok, "setup call failed");
    }

    /// @notice Stake this account with the alt-mempool staking registry.
    /// @dev    The registry keys everything off `msg.sender`, so the *contract* must make
    ///         this call. A staked account entity gets the wider associated-storage
    ///         carve-out, which is what lets `validate()` read the oracle's global slots.
    function stake(address stakingRegistry, uint32 unstakeDelaySec) external payable {
        if (msg.sender != owner) revert NotOwner();
        (bool ok,) = stakingRegistry.call{value: msg.value}(
            abi.encodeWithSignature("addStake(uint32)", unstakeDelaySec)
        );
        require(ok, "stake failed");
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Signature wire format is `<1 byte y-parity><r:32><s:32>`, the same shape as
    ///      the frame transaction's own signatures. `ecrecover` wants v in {27, 28} and
    ///      accepts high-s, so we normalize both here.
    function _recover(IntentLib.Intent memory i, bytes memory signature) internal view returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 digest = i.hash(address(this), chainId);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            v := byte(0, mload(add(signature, 0x20)))
            r := mload(add(signature, 0x21))
            s := mload(add(signature, 0x41))
        }

        // Reject malleable signatures (s must be in the lower half of the curve order).
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            return address(0);
        }
        if (v > 1) return address(0);

        return ecrecover(digest, v + 27, r, s);
    }

    /// @dev EIP-8141 `SIGPARAM` (0xb4) via the probe stub: the resolved signer of the
    ///      signature entry at `index`. For a `SECP256K1`/`P256` entry this is the
    ///      explicit `signer` (or `tx.sender` if it was omitted); for `ARBITRARY` the
    ///      instruction halts, which the stub surfaces as a failed delegatecall.
    function _resolvedSigner(uint256 index) internal returns (address signer) {
        (bool ok, bytes memory ret) =
            signerProbe.delegatecall(abi.encode(SIGPARAM_RESOLVED_SIGNER, index));
        if (!ok || ret.length < 32) revert Rejected(E_SIGPARAM_FAILED);
        signer = abi.decode(ret, (address));
    }

    function _checkExecutionFrame(bytes calldata data) internal {
        bytes memory expected = abi.encodeCall(this.execute, (data));
        (bool ok, bytes memory result) = frameProbe.delegatecall(abi.encode(expected.length));
        if (!ok || result.length != 288) revert Rejected(E_FRAME_SHAPE);
        (
            uint256 count, address target, uint256 mode, uint256 flags, uint256 value,
            uint256 length, bytes32 dataHash, bytes32 signedMessage, bytes32 canonicalHash
        ) = abi.decode(result, (uint256, address, uint256, uint256, uint256, uint256, bytes32, bytes32, bytes32));
        if (count != 2 || target != address(this) || mode != 2 || flags != 0 || value != 0
            || length != expected.length || dataHash != keccak256(expected)) revert Rejected(E_FRAME_SHAPE);
        if (signedMessage != bytes32(0) && signedMessage != canonicalHash) revert Rejected(E_BAD_SIG);
    }

    /// @dev EIP-8141 `APPROVE` (0xaa), via the stub. Exits the delegatecall frame and
    ///      sets the transaction-scoped approval context.
    function _approve(uint256 scope) internal {
        (bool ok,) = approver.delegatecall(abi.encode(scope));
        if (!ok) revert Rejected(E_APPROVE_FAILED);
    }

    function _agentKeyCached() internal view returns (address) {
        return _grant().agentKey;
    }

    /// @dev The only place the account learns its grant. The live variant reads the
    ///      registry on every check; `MirrorAgentAccount` overrides this with a local
    ///      copy to demonstrate what revocation latency buys.
    function _grant() internal view virtual returns (PermissionRegistry.Grant memory) {
        return registry.current(address(this));
    }

    /// @dev Same seam for the allowlist.
    function _allowed(address target, bytes4 selector) internal view virtual returns (bool) {
        return registry.isAllowed(address(this), target, selector);
    }

    receive() external payable {}
}

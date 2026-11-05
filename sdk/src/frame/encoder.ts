import { concatBytes } from "@noble/hashes/utils";
import { keccak_256 } from "@noble/hashes/sha3";
import { rlpEncode, hexToBytes, type RlpInput } from "./rlp.ts";
import { FRAME_TX_TYPE, type FrameTx } from "./types.ts";

/**
 * Serialise the transaction payload, field-for-field per EIP-8141,
 * EIP-8250 (keyed nonces) and EIP-8272 (recent-root references):
 *
 *   [chain_id, nonce_keys, nonce_seq, sender, frames, signatures, fees,
 *    blob_versioned_hashes, recent_root_references]
 *
 *   frames     = [[mode, flags, target, [execution, state], value, data], ...]
 *   signatures = [[scheme, signer, msg, signature], ...]
 *   fees       = [max_priority_fee_per_gas, max_fee_per_gas, max_fee_per_blob_gas]
 *   refs       = [[source_id, slot, root], ...]
 */
function payload(tx: FrameTx, elision: SignatureElision | "none"): RlpInput {
  return [
    tx.chainId,
    tx.nonceKeys,
    tx.nonceSeq,
    hexToBytes(tx.sender),
    tx.frames.map(
      (f): RlpInput => [
        f.mode,
        f.flags,
        f.target === null ? null : hexToBytes(f.target),
        [f.limits.execution, f.limits.state],
        f.value,
        f.data,
      ],
    ),
    tx.signatures.map(
      (s): RlpInput => [
        s.scheme,
        s.signer === null ? null : hexToBytes(s.signer),
        s.msg,
        // For signatures over the canonical hash, the raw bytes are replaced
        // before hashing. EIP-8141 says replace them with their *length*,
        // RLP-encoded as an unsigned integer: a signer must therefore know its
        // own encoded size before signing.
        elision === "length" && s.msg.length === 0 ? s.signature.length : elision === "empty" && s.msg.length === 0 ? new Uint8Array(0) : s.signature,
      ],
    ),
    [tx.fees.maxPriorityFeePerGas, tx.fees.maxFeePerGas, tx.fees.maxFeePerBlobGas],
    tx.blobVersionedHashes,
    tx.recentRootReferences.map(
      (r): RlpInput => [r.sourceId, r.slot, r.root],
    ),
  ];
}

/**
 * How to treat the raw `signature` bytes of an empty-`msg` entry in the
 * signing hash.
 *
 * EIP-8141's text says replace them with their *length*. The live devnet
 * (ethrex `v23.0.0-eip8141-tracer` + the reference sidecar's `computeSigHash`)
 * instead elides them to `0x`. `"empty"` is therefore the default because it
 * is what actually authenticates on-chain; `"length"` is kept so the
 * divergence can be reproduced and reported.
 */
export type SignatureElision = "length" | "empty";

/** `0x06 || rlp(payload)` — the wire encoding. */
export function encodeFrameTx(tx: FrameTx): Uint8Array {
  return concatBytes(Uint8Array.of(FRAME_TX_TYPE), rlpEncode(payload(tx, "none")));
}

/**
 * `keccak256(0x06 || rlp(payload))` with empty-`msg` signature bytes elided.
 * This is what a signer signs.
 */
export function computeSigHash(tx: FrameTx, elision: SignatureElision = "empty"): Uint8Array {
  return keccak_256(concatBytes(Uint8Array.of(FRAME_TX_TYPE), rlpEncode(payload(tx, elision))));
}

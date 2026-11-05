import { test } from "node:test";
import assert from "node:assert/strict";
import { rlpEncode, bytesToHex, hexToBytes } from "../src/frame/rlp.ts";
import { encodeFrameTx, computeSigHash } from "../src/frame/encoder.ts";
import { frameTxIntrinsicGas, maxGas, verifyGas, MAX_VERIFY_GAS } from "../src/frame/gas.ts";
import { Mode, Scope, Scheme, type FrameTx } from "../src/frame/types.ts";

const hex = (b: Uint8Array) => bytesToHex(b);

test("rlp: canonical vectors", () => {
  assert.equal(hex(rlpEncode("0x")), "0x80");
  assert.equal(hex(rlpEncode(0)), "0x80");
  assert.equal(hex(rlpEncode(15)), "0x0f");
  assert.equal(hex(rlpEncode(1024)), "0x820400");
  assert.equal(hex(rlpEncode("0x646f67")), "0x83646f67"); // "dog"
  assert.equal(hex(rlpEncode([])), "0xc0");
  assert.equal(hex(rlpEncode(["0x636174", "0x646f67"])), "0xc88363617483646f67"); // ["cat","dog"]
  assert.equal(hex(rlpEncode([[], [[]], [[], [[]]]])), "0xc7c0c1c0c3c0c1c0");
});

test("rlp: zero is the empty string, not 0x00", () => {
  assert.equal(hex(rlpEncode(0n)), "0x80");
  assert.equal(hex(rlpEncode(1n)), "0x01");
  assert.equal(hex(rlpEncode(127n)), "0x7f");
  assert.equal(hex(rlpEncode(128n)), "0x8180");
});

function sampleTx(sigBytes: Uint8Array): FrameTx {
  return {
    chainId: 1337n,
    nonceKeys: [0n],
    nonceSeq: 0n,
    sender: "0x00000000000000000000000000000000000000aa",
    frames: [
      {
        mode: Mode.VERIFY,
        flags: Scope.EXECUTION_AND_PAYMENT,
        target: null,
        limits: { execution: 60_000n, state: 0n },
        value: 0n,
        data: hexToBytes("0xdeadbeef"),
      },
      {
        mode: Mode.SENDER,
        flags: 0,
        target: null,
        limits: { execution: 120_000n, state: 0n },
        value: 0n,
        data: hexToBytes("0xcafebabe"),
      },
    ],
    signatures: [{ scheme: Scheme.SECP256K1, signer: null, msg: new Uint8Array(0), signature: sigBytes }],
    fees: { maxPriorityFeePerGas: 1n, maxFeePerGas: 10n ** 18n, maxFeePerBlobGas: 0n },
    blobVersionedHashes: [],
    recentRootReferences: [],
  };
}

test("encoder: envelope byte is 0x06", () => {
  const tx = sampleTx(new Uint8Array(65).fill(1));
  const encoded = encodeFrameTx(tx);
  assert.equal(encoded[0], 0x06);
  assert.ok(encoded.length > 100);
});

test("encoder: field order matches the sidecar codec", () => {
  // [chain_id, nonce_keys, nonce_seq, sender, frames, signatures, fees,
  //  blob_versioned_hashes, recent_root_references]
  const tx = sampleTx(new Uint8Array(65).fill(1));
  const body = rlpEncode([
    tx.chainId,
    tx.nonceKeys,
    tx.nonceSeq,
    hexToBytes(tx.sender),
    tx.frames.map((f) => [
      f.mode,
      f.flags,
      null,
      [f.limits.execution, f.limits.state],
      f.value,
      f.data,
    ]),
    tx.signatures.map((s) => [s.scheme, null, s.msg, s.signature]),
    [tx.fees.maxPriorityFeePerGas, tx.fees.maxFeePerGas, tx.fees.maxFeePerBlobGas],
    [],
    [],
  ]);
  assert.equal(hex(encodeFrameTx(tx)), hex(new Uint8Array([0x06, ...body])));
});

test("sighash: elides raw signature bytes, and the two elision rules differ", () => {
  const a = new Uint8Array(65).fill(0x11);
  const b = new Uint8Array(65).fill(0x22);
  const c = new Uint8Array(64).fill(0x11);

  // Contents never matter: an empty-msg signature cannot commit to itself.
  assert.equal(
    hex(computeSigHash(sampleTx(a), "length")),
    hex(computeSigHash(sampleTx(b), "length")),
  );
  assert.equal(
    hex(computeSigHash(sampleTx(a), "empty")),
    hex(computeSigHash(sampleTx(b), "empty")),
  );

  // EIP-8141's text commits to the length; the live devnet elides to `0x`,
  // which does not. Both are exposed so the divergence stays visible.
  assert.notEqual(
    hex(computeSigHash(sampleTx(a), "length")),
    hex(computeSigHash(sampleTx(c), "length")),
    "the spec rule must commit to signature length",
  );
  assert.equal(
    hex(computeSigHash(sampleTx(a), "empty")),
    hex(computeSigHash(sampleTx(c), "empty")),
    "the devnet rule elides to empty and ignores length",
  );
});

test("sighash: keyed nonces and root references are committed", () => {
  const base = hex(computeSigHash(sampleTx(new Uint8Array(65).fill(1))));
  assert.notEqual(base, hex(computeSigHash({ ...sampleTx(new Uint8Array(65).fill(1)), nonceKeys: [1n] })));
  assert.notEqual(base, hex(computeSigHash({ ...sampleTx(new Uint8Array(65).fill(1)), nonceSeq: 1n })));
  assert.notEqual(
    base,
    hex(
      computeSigHash({
        ...sampleTx(new Uint8Array(65).fill(1)),
        recentRootReferences: [{ sourceId: new Uint8Array(32).fill(2), slot: 1n, root: new Uint8Array(32).fill(3) }],
      }),
    ),
  );
});

test("gas: intrinsic cost is sane and verify gas is under the public cap", () => {
  const tx = sampleTx(new Uint8Array(65).fill(1));
  const intrinsic = frameTxIntrinsicGas(tx);
  assert.ok(intrinsic > 12_000, `intrinsic too low: ${intrinsic}`);
  assert.ok(intrinsic < 30_000, `intrinsic too high: ${intrinsic}`);

  const vg = verifyGas(tx, 1);
  assert.ok(vg < MAX_VERIFY_GAS, `verify gas ${vg} should fit for this toy tx`);

  assert.ok(maxGas(tx) > intrinsic);
});

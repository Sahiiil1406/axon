import test from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { toFunctionSelector } from "viem";
import {
  buildAgentFrameTx,
  encodeExecute,
  encodeIntent,
  encodeValidate,
  signAgentFrameTx,
  toFrameTxJson,
  type Intent,
} from "../src/builder.ts";
import { computeSigHash } from "../src/frame/encoder.ts";
import { bytesToHex, hexToBytes } from "../src/frame/rlp.ts";
import { Mode, Scope, Scheme } from "../src/frame/types.ts";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const pub = secp256k1.getPublicKey(hexToBytes(PK.slice(2)), false);
const AGENT = `0x${Buffer.from(keccak_256(pub.slice(1))).toString("hex").slice(24)}` as const;
const ACCOUNT = "0x96a21935ddbf224d64efc933449016bbb4551a2e" as const;

const intent: Intent = {
  target: "0x5ea0d228af152b987c0a05d71527609744128996",
  selector: "0xdf8879b8",
  args: `0x${"00".repeat(64)}` as const,
  value: 0n,
  spend: 10n ** 16n,
  nonce: 7n,
  deadline: 1_800_000_000n,
  grantHash: `0x${"ab".repeat(32)}` as const,
};

const build = () =>
  buildAgentFrameTx({ account: ACCOUNT, agentKey: AGENT, intent, nonceSeq: 3n });

test("builder: two frames, VERIFY then SENDER", () => {
  const tx = build();
  assert.equal(tx.frames.length, 2);
  assert.equal(tx.frames[0].mode, Mode.VERIFY);
  assert.equal(tx.frames[0].flags, Scope.EXECUTION_AND_PAYMENT);
  assert.equal(tx.frames[1].mode, Mode.SENDER);
  assert.equal(tx.frames[1].flags, 0);
  assert.equal(tx.sender, ACCOUNT);
});

test("builder: calldata is validate(bytes) then execute(bytes)", () => {
  const tx = build();
  assert.equal(bytesToHex(tx.frames[0].data).slice(0, 10), toFunctionSelector("validate(bytes)"));
  assert.equal(bytesToHex(tx.frames[1].data).slice(0, 10), toFunctionSelector("execute(bytes)"));
  assert.equal(bytesToHex(tx.frames[0].data).slice(0, 10), encodeValidate(intent).slice(0, 10));
  assert.equal(bytesToHex(tx.frames[1].data).slice(0, 10), encodeExecute(intent).slice(0, 10));
});

test("builder: authority is in the signature list, not the calldata", () => {
  const tx = build();
  assert.equal(tx.signatures.length, 2);
  assert.equal(tx.signatures[0].scheme, Scheme.SECP256K1);
  assert.equal(tx.signatures[0].signer, AGENT);
  assert.equal(tx.signatures[0].msg.length, 0);
  assert.equal(tx.signatures[1].scheme, Scheme.ARBITRARY);
  assert.equal(tx.signatures[1].signer, null);
});

test("builder: the agent signature verifies over compute_sig_hash(tx, empty)", () => {
  const tx = signAgentFrameTx(build(), PK);
  const digest = computeSigHash(tx, "empty");
  const sig = tx.signatures[0].signature;
  assert.equal(sig.length, 65);
  // `format: "recovered"` returns [recovery, r||s] so the 64-byte body is
  // `sig.subarray(1)`, and the digest is already a hash (prehash: false).
  assert.equal(secp256k1.verify(sig.subarray(1), digest, pub, { prehash: false }), true);
});

test("builder: signing is deterministic for a fixed transaction", () => {
  const a = signAgentFrameTx(build(), PK);
  const b = signAgentFrameTx(build(), PK);
  assert.equal(bytesToHex(a.signatures[0].signature), bytesToHex(b.signatures[0].signature));
});

test("builder: the wire JSON carries hex for every numeric field", () => {
  const json = toFrameTxJson(build());
  assert.equal(json.chainId, "0x539");
  assert.equal(json.nonceSeq, "0x3");
  assert.equal(json.frames[0].limits.execution, "0x13880");
  assert.equal(json.signatures[1].signer, "0x");
  assert.equal(json.signatures[1].signature, "0x");
});

test("builder: the intent payload round-trips through the same ABI the account decodes", () => {
  const encoded = encodeIntent(intent);
  assert.match(encoded, /^0x/);
  // target is the first head word after the dynamic-tuple offset
  assert.equal(BigInt(`0x${encoded.slice(66, 130)}`), BigInt(intent.target));
});

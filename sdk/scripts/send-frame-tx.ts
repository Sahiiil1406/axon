/**
 * Submit a minimal `self_verify` frame transaction to the EIP-8141 alt mempool devnet.
 *
 * This is the hour 0-6 gate: if this lands, our RLP encoder, the signature-elision rule
 * and the signature format are all correct, and we have an admitted transaction.
 *
 *   PRIVATE_KEY=0x... tsx scripts/send-frame-tx.ts --simulate
 *   PRIVATE_KEY=0x... tsx scripts/send-frame-tx.ts
 *   PRIVATE_KEY=0x... tsx scripts/send-frame-tx.ts --simulate --elision=empty
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "../src/frame/rlp.ts";
import { encodeFrameTx, computeSigHash, type SignatureElision } from "../src/frame/encoder.ts";
import { Mode, Scope, Scheme, type FrameTx } from "../src/frame/types.ts";

const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const SIDECAR = process.env.SIDECAR ?? "https://altmempool.forshtat.com/rpc";
const PK = process.env.PRIVATE_KEY;
if (!PK) throw new Error("PRIVATE_KEY is required");

const simulateOnly = process.argv.includes("--simulate");
const elisionArg = process.argv.find((a) => a.startsWith("--elision="));
const elision: SignatureElision = elisionArg === "--elision=length" ? "length" : "empty";

function addressOf(priv: string): `0x${string}` {
  const uncompressed = secp256k1.getPublicKey(hexToBytes(priv.replace(/^0x/, "")), false);
  return ("0x" + bytesToHex(keccak_256(uncompressed.slice(1)).slice(12)).slice(2)) as `0x${string}`;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

const hex = (n: bigint) => "0x" + n.toString(16);

const address = addressOf(PK);
const nonce = BigInt(await rpc(RPC, "eth_getTransactionCount", [address, "latest"]));
const gasPrice = await rpc(SIDECAR, "skandha_getGasPrice", []);

const tx: FrameTx = {
  chainId: 1337n,
  nonceKeys: [0n], // linear nonce domain
  nonceSeq: nonce,
  sender: address,
  frames: [
    {
      mode: Mode.VERIFY,
      flags: Scope.EXECUTION_AND_PAYMENT,
      target: null, // resolves to tx.sender
      limits: { execution: 50_000n, state: 0n },
      value: 0n,
      data: new Uint8Array(0),
    },
    {
      mode: Mode.SENDER,
      flags: 0,
      target: address, // 1 wei to ourselves; the account already exists
      limits: { execution: 50_000n, state: 0n },
      value: 1n,
      data: new Uint8Array(0),
    },
  ],
  signatures: [
    { scheme: Scheme.SECP256K1, signer: null, msg: new Uint8Array(0), signature: new Uint8Array(65) },
  ],
  fees: {
    maxPriorityFeePerGas: BigInt(gasPrice.maxPriorityFeePerGas),
    maxFeePerGas: BigInt(gasPrice.maxFeePerGas),
    maxFeePerBlobGas: 0n,
  },
  blobVersionedHashes: [],
  recentRootReferences: [],
};

const sigHash = computeSigHash(tx, elision);
// `recovered` format is exactly the wire layout: <1 byte y-parity><r:32><s:32>.
// `prehash: false` is essential: noble v2 hashes the input by default, and `sigHash`
// is already the digest the protocol signs.
const signature = secp256k1.sign(sigHash, hexToBytes(PK.replace(/^0x/, "")), {
  format: "recovered",
  prehash: false,
});
tx.signatures[0].signature = signature;

console.log("sender   ", address);
console.log("nonce    ", nonce.toString());
console.log("elision  ", elision);
console.log("sigHash  ", bytesToHex(sigHash));
console.log("signature", bytesToHex(signature));

const json = {
  chainId: hex(tx.chainId),
  nonceKeys: tx.nonceKeys.map(hex),
  nonceSeq: hex(tx.nonceSeq),
  sender: tx.sender,
  frames: tx.frames.map((f) => ({
    mode: f.mode,
    flags: f.flags,
    target: f.target,
    limits: { execution: hex(f.limits.execution), state: hex(f.limits.state) },
    value: hex(f.value),
    data: bytesToHex(f.data),
  })),
  signatures: [
    { scheme: Scheme.SECP256K1, signer: "0x", msg: "0x", signature: bytesToHex(signature) },
  ],
  fees: {
    maxPriorityFeePerGas: hex(tx.fees.maxPriorityFeePerGas),
    maxFeePerGas: hex(tx.fees.maxFeePerGas),
    maxFeePerBlobGas: hex(tx.fees.maxFeePerBlobGas),
  },
  blobVersionedHashes: [] as string[],
  recentRootReferences: [] as unknown[],
};

const raw = bytesToHex(encodeFrameTx(tx));

if (simulateOnly) {
  const sim = await rpc(RPC, "ethrex_simulateFrameTransaction", [raw, "latest", { trace: true }]);
  console.log(JSON.stringify(sim, null, 2));
  process.exit(sim.valid ? 0 : 1);
}

const hash = await rpc(SIDECAR, "eth_sendFrameTransaction", [json]);
console.log("txHash   ", hash);

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const status = await rpc(SIDECAR, "skandha_frameTransactionStatus", [hash]);
  console.log(`[${i}] ${status.status}`);
  if (["OnChain", "Finalized", "Reverted", "Cancelled"].includes(status.status)) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.status === "Reverted" ? 1 : 0);
  }
}

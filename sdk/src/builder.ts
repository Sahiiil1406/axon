import { encodeAbiParameters, encodeFunctionData } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "./frame/rlp.ts";
import { computeSigHash } from "./frame/encoder.ts";
import { Mode, Scope, Scheme, type FrameTx, type FrameTxJson } from "./frame/types.ts";

/**
 * The account's transaction, assembled once and shared by every consumer:
 * the demo scripts, the agent loop, and any external integrator.
 *
 *   frame 0  VERIFY  flags=0x3  target=sender  validate(intent)
 *   frame 1  SENDER  flags=0x0  target=sender  execute(intent)
 *
 * Authority is in the signature list, not in the calldata: entry 0 is a
 * SECP256K1 signature with an explicit `signer` (the agent), entry 1 is the
 * ARBITRARY structural witness. `validate` reads entry 0 back with SIGPARAM.
 */

export interface Intent {
  target: `0x${string}`;
  selector: `0x${string}`;
  args: `0x${string}`;
  value: bigint;
  spend: bigint;
  nonce: bigint;
  deadline: bigint;
  grantHash: `0x${string}`;
}

export const AGENT_SIGNATURE_INDEX = 0;

export const INTENT_TUPLE = {
  type: "tuple",
  components: [
    { name: "target", type: "address" },
    { name: "selector", type: "bytes4" },
    { name: "args", type: "bytes" },
    { name: "value", type: "uint256" },
    { name: "spend", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "grantHash", type: "bytes32" },
  ],
} as const;

const ACCOUNT_ABI = [
  {
    type: "function",
    name: "validate",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
  },
] as const;

export function encodeIntent(intent: Intent): `0x${string}` {
  return encodeAbiParameters([INTENT_TUPLE], [intent]);
}

export function encodeValidate(intent: Intent, intentData = encodeIntent(intent)): `0x${string}` {
  return encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: "validate",
    args: [intentData],
  });
}

export function encodeExecute(intent: Intent, intentData = encodeIntent(intent)): `0x${string}` {
  return encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: "execute",
    args: [intentData],
  });
}

export interface BuildOptions {
  account: `0x${string}`;
  agentKey: `0x${string}`;
  intent: Intent;
  intentData?: `0x${string}`;
  chainId?: bigint;
  nonceSeq: bigint;
  nonceKeys?: bigint[];
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  verifyGas?: bigint;
  verifyStateGas?: bigint;
  executeGas?: bigint;
  executeStateGas?: bigint;
}

export function buildAgentFrameTx(opts: BuildOptions): FrameTx {
  const {
    account,
    agentKey,
    intent,
    intentData,
    chainId = 1337n,
    nonceSeq,
    nonceKeys = [0n],
    maxPriorityFeePerGas = 1n,
    maxFeePerGas = 9n,
    verifyGas = 80_000n,
    verifyStateGas = 0n,
    executeGas = 500_000n,
    executeStateGas = 500_000n,
  } = opts;

  return {
    chainId,
    nonceKeys,
    nonceSeq,
    sender: account,
    frames: [
      {
        mode: Mode.VERIFY,
        flags: Scope.EXECUTION_AND_PAYMENT,
        target: null,
        limits: { execution: verifyGas, state: verifyStateGas },
        value: 0n,
        data: hexToBytes(encodeValidate(intent, intentData)),
      },
      {
        mode: Mode.SENDER,
        flags: 0,
        target: null,
        limits: { execution: executeGas, state: executeStateGas },
        value: 0n,
        data: hexToBytes(encodeExecute(intent, intentData)),
      },
    ],
    signatures: [
      {
        scheme: Scheme.SECP256K1,
        signer: agentKey,
        msg: new Uint8Array(0),
        signature: new Uint8Array(65),
      },
      {
        scheme: Scheme.ARBITRARY,
        signer: null,
        msg: new Uint8Array(0),
        signature: new Uint8Array(0),
      },
    ],
    fees: { maxPriorityFeePerGas, maxFeePerGas, maxFeePerBlobGas: 0n },
    blobVersionedHashes: [],
    recentRootReferences: [],
  };
}

/**
 * The agent signs the frame transaction itself, not a detached intent digest.
 * `"empty"` is what this devnet's ethrex and sidecar actually hash.
 */
export function signAgentFrameTx(tx: FrameTx, agentPrivateKey: `0x${string}`): FrameTx {
  const digest = computeSigHash(tx, "empty");
  const signature = secp256k1.sign(digest, hexToBytes(agentPrivateKey.replace(/^0x/, "")), {
    format: "recovered",
    prehash: false,
  });
  tx.signatures[AGENT_SIGNATURE_INDEX].signature = signature;
  return tx;
}

export function buildSignedAgentTx(opts: BuildOptions & { agentPrivateKey: `0x${string}` }): FrameTx {
  const { agentPrivateKey, ...rest } = opts;
  return signAgentFrameTx(buildAgentFrameTx(rest), agentPrivateKey);
}

const hex = (n: bigint): string => `0x${n.toString(16)}`;

/** The `eth_sendFrameTransaction` params[0] shape. */
export function toFrameTxJson(tx: FrameTx): FrameTxJson {
  return {
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
    signatures: tx.signatures.map((s) => ({
      scheme: s.scheme,
      signer: s.signer ?? ("0x" as const),
      msg: bytesToHex(s.msg),
      signature: bytesToHex(s.signature),
    })),
    fees: {
      maxPriorityFeePerGas: hex(tx.fees.maxPriorityFeePerGas),
      maxFeePerGas: hex(tx.fees.maxFeePerGas),
      maxFeePerBlobGas: hex(tx.fees.maxFeePerBlobGas),
    },
    blobVersionedHashes: tx.blobVersionedHashes.map(bytesToHex),
    recentRootReferences: [],
  };
}

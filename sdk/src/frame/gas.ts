import type { FrameTx, SignatureEntry } from "./types.ts";
import { Scheme } from "./types.ts";

/**
 * Gas helpers from EIP-8141. Needed to build `max_fee` and to report what the
 * admission simulator is looking at.
 */

const STANDARD_TOKEN_COST = 4;
const TOTAL_COST_FLOOR_PER_TOKEN = 16;
const TX_VALUE_COST = 6_000;
const GAS_PER_BLOB = 131_072;
export const FRAME_TX_INTRINSIC_COST = 12_000;
export const FRAME_TX_PER_FRAME_COST = 475;
export const MAX_VERIFY_GAS = 100_000;
export const MAX_VERIFY_STATE_GAS = 500_000;
export const TX_MAX_GAS_LIMIT = 16_777_216;

/** Weighted calldata tokens: zero bytes cost 1, non-zero bytes cost 4. */
export function tokensIn(data: Uint8Array): number {
  let zero = 0;
  for (const b of data) if (b === 0) zero++;
  return zero + (data.length - zero) * 4;
}

/** Floor pricing treats every byte uniformly. */
export function floorTokensIn(data: Uint8Array): number {
  return data.length * 4;
}

export function calldataCost(data: Uint8Array): number {
  return STANDARD_TOKEN_COST * tokensIn(data);
}

export function signatureGas(scheme: number): number {
  switch (scheme) {
    case Scheme.SECP256K1:
      return 2_800;
    case Scheme.P256:
      return 6_700;
    case Scheme.ARBITRARY:
      return 100;
    default:
      throw new Error(`unknown signature scheme ${scheme}`);
  }
}

function signatureBytesTokens(s: SignatureEntry): number {
  return s.msg.length === 0 ? floorTokensIn(s.signature) : tokensIn(s.signature);
}

function signatureDataCost(s: SignatureEntry): number {
  return (
    calldataCost(s.signer === null ? new Uint8Array(0) : hexToBytes(s.signer)) +
    calldataCost(s.msg) +
    STANDARD_TOKEN_COST * signatureBytesTokens(s)
  );
}

function valueCost(tx: FrameTx, i: number): number {
  const f = tx.frames[i];
  if (f.value > 0n && f.target !== null && f.target.toLowerCase() !== tx.sender.toLowerCase()) {
    return TX_VALUE_COST;
  }
  return 0;
}

export function frameTxIntrinsicGas(tx: FrameTx): number {
  const frameData = tx.frames.reduce((n, f) => n + calldataCost(f.data), 0);
  const sigData = tx.signatures.reduce((n, s) => n + signatureDataCost(s), 0);
  const sigVerify = tx.signatures.reduce((n, s) => n + signatureGas(s.scheme), 0);
  const value = tx.frames.reduce((n, _, i) => n + valueCost(tx, i), 0);

  return (
    FRAME_TX_INTRINSIC_COST + tx.frames.length * FRAME_TX_PER_FRAME_COST + frameData + sigData + sigVerify + value
  );
}

export function calldataFloorGas(tx: FrameTx): number {
  const frameFloor = tx.frames.reduce((n, f) => n + floorTokensIn(f.data), 0);
  const sigFloor = tx.signatures.reduce(
    (n, s) =>
      n +
      floorTokensIn(s.signer === null ? new Uint8Array(0) : hexToBytes(s.signer)) +
      floorTokensIn(s.msg) +
      floorTokensIn(s.signature),
    0,
  );
  const sigVerify = tx.signatures.reduce((n, s) => n + signatureGas(s.scheme), 0);
  const value = tx.frames.reduce((n, _, i) => n + valueCost(tx, i), 0);

  return (
    FRAME_TX_INTRINSIC_COST +
    tx.frames.length * FRAME_TX_PER_FRAME_COST +
    sigVerify +
    value +
    TOTAL_COST_FLOOR_PER_TOKEN * (frameFloor + sigFloor)
  );
}

export function standardGasLimit(tx: FrameTx): number {
  const exec = tx.frames.reduce((n, f) => n + Number(f.limits.execution), 0);
  const state = tx.frames.reduce((n, f) => n + Number(f.limits.state), 0);
  return frameTxIntrinsicGas(tx) + exec + state;
}

export function maxGas(tx: FrameTx): number {
  const state = tx.frames.reduce((n, f) => n + Number(f.limits.state), 0);
  return Math.max(standardGasLimit(tx), calldataFloorGas(tx) + state);
}

export function blobGas(tx: FrameTx): number {
  return tx.blobVersionedHashes.length * GAS_PER_BLOB;
}

export function requiredMaxFee(tx: FrameTx, baseFee: bigint, blobBaseFee: bigint): bigint {
  return BigInt(maxGas(tx)) * baseFee + BigInt(blobGas(tx)) * blobBaseFee;
}

/** Sum of `limits.execution` over the validation prefix plus signature intrinsic. */
export function verifyGas(tx: FrameTx, prefixFrameCount: number): number {
  const prefix = tx.frames.slice(0, prefixFrameCount);
  const exec = prefix.reduce((n, f) => n + Number(f.limits.execution), 0);
  const sigVerify = tx.signatures.reduce((n, s) => n + signatureGas(s.scheme), 0);
  return FRAME_TX_INTRINSIC_COST + exec + sigVerify;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

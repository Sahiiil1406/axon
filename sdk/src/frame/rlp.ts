import { concatBytes } from "@noble/hashes/utils";

/**
 * Minimal RLP encoder. EIP-8141 payloads are plain nested lists of byte strings and
 * unsigned integers, so this is the whole of what we need.
 */
export type RlpInput = Uint8Array | number | bigint | string | null | RlpInput[];

export function rlpEncode(input: RlpInput): Uint8Array {
  if (input === null) return Uint8Array.of(0x80);

  if (Array.isArray(input)) {
    const body = concatBytes(...input.map(rlpEncode));
    return concatBytes(encodeLength(body.length, 0xc0), body);
  }

  const bytes = toBytes(input);
  // A single byte below 0x80 is its own encoding.
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
  return concatBytes(encodeLength(bytes.length, 0x80), bytes);
}

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) return Uint8Array.of(offset + len);
  const lenBytes = minimalBytes(BigInt(len));
  return concatBytes(Uint8Array.of(offset + 55 + lenBytes.length), lenBytes);
}

/** Big-endian, no leading zeros. Zero is the empty string, per RLP. */
export function minimalBytes(n: bigint): Uint8Array {
  if (n < 0n) throw new Error("rlp: negative integer");
  if (n === 0n) return new Uint8Array(0);
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes("0x" + hex);
}

function toBytes(input: Uint8Array | number | bigint | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (typeof input === "string") return hexToBytes(input);
  return minimalBytes(BigInt(input));
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error(`hex: odd length ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): `0x${string}` {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s as `0x${string}`;
}

export function toBigInt(v: bigint | number | string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(v);
}

/** EIP-8141 frame transaction types. */

export const FRAME_TX_TYPE = 0x06;

/** Sentinel address used as `ORIGIN` in DEFAULT and VERIFY frames. */
export const ENTRY_POINT = "0x00000000000000000000000000000000000000aa" as const;

/** Canonical expiry verifier predeploy. */
export const EXPIRY_VERIFIER = "0x81413f0cF12e9b6a49B1D0439E081c577D57FfFf" as const;

export const Mode = { DEFAULT: 0, VERIFY: 1, SENDER: 2 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const Scope = { NONE: 0x0, PAYMENT: 0x1, EXECUTION: 0x2, EXECUTION_AND_PAYMENT: 0x3 } as const;
export type Scope = (typeof Scope)[keyof typeof Scope];

/** Bit 2 of `flags`. Never valid on VERIFY frames. */
export const ATOMIC_BATCH_FLAG = 0x4;

export const Scheme = { ARBITRARY: 0, SECP256K1: 1, P256: 2 } as const;
export type Scheme = (typeof Scheme)[keyof typeof Scheme];

export interface FrameLimits {
  /** Execution gas: computation, calldata, account access. */
  execution: bigint;
  /** State gas (EIP-8037): durable state growth. */
  state: bigint;
}

export interface Frame {
  mode: Mode;
  flags: number;
  /** `null` resolves to `tx.sender`. */
  target: `0x${string}` | null;
  limits: FrameLimits;
  value: bigint;
  data: Uint8Array;
}

export interface SignatureEntry {
  scheme: Scheme;
  /** Must be empty for ARBITRARY. */
  signer: `0x${string}` | null;
  /** Empty means "the canonical transaction signature hash"; otherwise exactly 32 bytes. */
  msg: Uint8Array;
  signature: Uint8Array;
}

export interface FeeParams {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxFeePerBlobGas: bigint;
}

/** EIP-8272. */
export interface RecentRootReference {
  sourceId: Uint8Array;
  slot: bigint;
  root: Uint8Array;
}

export interface FrameTx {
  chainId: bigint;
  /** EIP-8250 keyed nonce domain. The linear domain is `[0n]`. */
  nonceKeys: bigint[];
  nonceSeq: bigint;
  sender: `0x${string}`;
  frames: Frame[];
  signatures: SignatureEntry[];
  fees: FeeParams;
  blobVersionedHashes: Uint8Array[];
  recentRootReferences: RecentRootReference[];
}

/** The JSON shape `eth_sendFrameTransaction` accepts. */
export interface FrameTxJson {
  chainId: string;
  nonceKeys: string[];
  nonceSeq: string;
  sender: `0x${string}`;
  frames: {
    mode: number;
    flags: number;
    target: `0x${string}` | null;
    limits: { execution: string; state: string };
    value: string;
    data: `0x${string}`;
  }[];
  signatures: {
    scheme: number;
    signer: `0x${string}` | "0x";
    msg: `0x${string}`;
    signature: `0x${string}`;
  }[];
  fees: {
    maxPriorityFeePerGas: string;
    maxFeePerGas: string;
    maxFeePerBlobGas: string;
  };
  blobVersionedHashes: string[];
  recentRootReferences: unknown[];
}

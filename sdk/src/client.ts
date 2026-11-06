import {
  createPublicClient,
  http,
  getAddress,
  isAddress,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  getEnsAddress,
  getEnsName,
  getEnsResolver,
  getEnsText,
  normalize,
  type GetEnsTextParameters,
} from "viem/ens";
import { encodeFrameTx } from "./frame/encoder.ts";
import { bytesToHex } from "./frame/rlp.ts";
import type { FrameTx, FrameTxJson } from "./frame/types.ts";
import { buildSignedAgentTx, toFrameTxJson, type Intent } from "./builder.ts";
import {
  coerceArgs,
  encodeActionCall,
  type ManifestAction,
} from "./manifest.ts";

/**
 * A thin client over one agent-native account. It reads the chain, turns a
 * manifest action into an `Intent`, builds and signs the frame transaction,
 * and submits it to the alt-mempool sidecar.
 *
 * It deliberately does not hold an owner key: the agent can act only within
 * the grant, and every write goes through the account's validation frame.
 */

export interface AxonConfig {
  account: Address;
  registry: Address;
  vault: Address;
  oracle: Address;
  agentPrivateKey: Hex;
  chainId?: number;
  rpc?: string;
  sidecar?: string;
  stakingRegistry?: Address;
  /** Sepolia RPC for ENSv2 resolution (agent identity/control plane). */
  ensRpc?: string;
  /** ENSv2 chain id for Sepolia (default 11155111). */
  ensChainId?: number;
}

export interface Grant {
  owner: Address;
  agentKey: Address;
  keyScheme: number;
  budgetPerEpoch: bigint;
  epochLength: bigint;
  expiresAt: bigint;
  active: boolean;
  version: bigint;
  grantHash: Hex;
}

export interface VaultState {
  deposits: bigint;
  position: bigint;
  lastActionAt: bigint;
  maxTrade: bigint;
  cooldown: bigint;
  maxOracleAge: bigint;
  maxSlippageBps: bigint;
  price: bigint;
  oracleUpdatedAt: bigint;
  blockTimestamp: bigint;
}

export interface SimulatedFrame {
  gasUsed: string;
  succeeded: boolean;
}

/** Agent permission resolved from an ENSv2 subdomain's Permissioned Resolver text records. */
export interface AgentPermission {
  name: string;
  account: Address | null;
  agentKey: Address | null;
  active: boolean;
  budget: bigint;
  version: bigint;
  allowlist: Array<{ target: Address; selector: Hex }>;
  textRecords: Record<string, string>;
}

export interface SimulateResult {
  canonicalMempoolValid: boolean;
  canonicalMempoolViolation: string | null;
  erc7562Trace: unknown[] | null;
  erc7562TraceError: string | null;
  executionError: string | null;
  executionStatus: string | null;
  frames: SimulatedFrame[] | null;
  gasUsed: string | null;
  maxCost: string | null;
  payer: Address | null;
  prefixShape: string | null;
}

export type IntentStatus = "New" | "Pending" | "Submitted" | "OnChain" | "Finalized" | "Reverted" | "Cancelled";

export interface SubmitResult {
  hash: Hex;
  status: IntentStatus;
  raw: Hex;
  tx: FrameTxJson;
}

export interface ExplorerAdmission {
  id: number;
  outcome: string;
  frameStatuses?: string[];
  checks: { rule: string; verdict: string; frameIndex?: number; entity?: string; reason?: string }[];
}

const REGISTRY_ABI = [
  {
    type: "function",
    name: "current",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "agentKey", type: "address" },
          { name: "keyScheme", type: "uint8" },
          { name: "budgetPerEpoch", type: "uint128" },
          { name: "epochLength", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
          { name: "active", type: "bool" },
          { name: "version", type: "uint256" },
          { name: "grantHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isAllowed",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

const ACCOUNT_ABI = [
  { type: "function", name: "intentNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "remainingBudget", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "spentInEpoch",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;

const VAULT_ABI = [
  { type: "function", name: "deposits", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "position", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastActionAt", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "MAX_TRADE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "COOLDOWN", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_ORACLE_AGE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_SLIPPAGE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const satisfies Abi;

const ORACLE_ABI = [
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "updatedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const satisfies Abi;

const REASONS: Record<string, string> = {
  E_NO_GRANT: "the account has no grant",
  E_GRANT_INACTIVE: "the grant is revoked",
  E_GRANT_STALE: "the intent was built against an older grant — re-read it",
  E_EXPIRED: "the grant has expired",
  E_DEADLINE: "the intent deadline has passed",
  E_NONCE: "the intent nonce is no longer current",
  E_TARGET_DENIED: "the target/selector pair is not allowlisted",
  E_EPOCH_BUDGET: "the spend exceeds the remaining epoch budget",
  E_BAD_SIG: "the resolved signer is not the granted agent key",
  E_SIGPARAM_FAILED: "SIGPARAM could not resolve the agent signature entry",
  E_NOT_FRAME: "execute() was called outside a frame transaction",
  E_PROTOCOL: "the protocol rejected the action",
  E_CALL_FAILED: "the target call reverted",
  E_APPROVE_FAILED: "APPROVE failed",
  P_ORACLE_STALE: "the oracle is older than the protocol allows",
  P_COOLDOWN: "the protocol cooldown has not elapsed",
  P_SIZE: "the trade is outside the protocol's size bounds",
  P_INSUFFICIENT: "the account's vault balance is too small",
  P_SLIPPAGE: "minOut is below the oracle-derived floor",
  P_DESTINATION: "the protocol only pays the account owner",
  P_UNKNOWN_ACTION: "the protocol does not expose that action",
};

const ascii = (hex: string): string => {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  let out = "";
  for (let i = 0; i < body.length; i += 2) {
    const byte = parseInt(body.slice(i, i + 2), 16);
    if (byte === 0 || Number.isNaN(byte)) break;
    out += String.fromCharCode(byte);
  }
  return out;
};

export class AxonClient {
  readonly config: Required<Omit<AxonConfig, "stakingRegistry" | "ensRpc" | "ensChainId">> & {
    stakingRegistry?: Address;
    ensRpc?: string;
    ensChainId?: number;
  };
  readonly publicClient: PublicClient;
  /** Sepolia public client for ENSv2 resolution (undefined when no ensRpc is configured). */
  readonly ensPublicClient: PublicClient | undefined;
  /** Derived from the key, not from the registry, so a stale grant cannot misroute the witness. */
  readonly agentAddress: Address;

  constructor(config: AxonConfig) {
    this.config = {
      chainId: 1337,
      rpc: "https://altmempool.forshtat.com",
      sidecar: "https://altmempool.forshtat.com/rpc",
      ensChainId: 11155111,
      ...config,
    };
    this.publicClient = createPublicClient({ transport: http(this.config.rpc) }) as PublicClient;
    this.ensPublicClient = this.config.ensRpc
      ? createPublicClient({
          chain: sepolia,
          transport: http(this.config.ensRpc),
        })
      : undefined;
    this.agentAddress = privateKeyToAccount(config.agentPrivateKey).address;
  }

  private async rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
        const json = (await res.json()) as { result?: T; error?: { message?: string } };
        if (json.error) throw new Error(`${method}: ${json.error.message ?? "unknown error"}`);
        return json.result as T;
      } catch (error) {
        lastError = error;
        const message = (error as Error).message ?? "";
        // A JSON-RPC error is deterministic; only retry transport/HTTP failures.
        if (message.startsWith(`${method}: `) && !message.includes("HTTP")) throw error;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  async getGrant(account = this.config.account): Promise<Grant> {
    const g = (await this.publicClient.readContract({
      address: this.config.registry,
      abi: REGISTRY_ABI,
      functionName: "current",
      args: [account],
    })) as Grant;
    return { ...g, active: Boolean(g.active) };
  }

  async isAllowed(target: Address, selector: Hex, account = this.config.account): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.config.registry,
      abi: REGISTRY_ABI,
      functionName: "isAllowed",
      args: [account, target, selector],
    })) as boolean;
  }

  async getIntentNonce(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.config.account,
      abi: ACCOUNT_ABI,
      functionName: "intentNonce",
    })) as bigint;
  }

  async remainingBudget(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.config.account,
      abi: ACCOUNT_ABI,
      functionName: "remainingBudget",
    })) as bigint;
  }

  async getSpent(epoch: bigint): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.config.account,
      abi: ACCOUNT_ABI,
      functionName: "spentInEpoch",
      args: [epoch],
    })) as bigint;
  }

  async getBlockTimestamp(): Promise<bigint> {
    return (await this.publicClient.getBlock({ blockTag: "latest" })).timestamp;
  }

  // -------------------------------------------------------------------
  // ENSv2 — agent identity resolution (Sepolia)
  // -------------------------------------------------------------------

  /** Normalize an ENS name (e.g. "trader.alice.eth"). */
  normalizeEnsName(name: string): string {
    return normalize(name);
  }

  /** Resolve an ENS name to its address (the agent's AgentAccount on the devnet). */
  async resolveEnsAddress(name: string): Promise<Address | null> {
    if (!this.ensPublicClient) return null;
    try {
      return await getEnsAddress(this.ensPublicClient, {
        name: this.normalizeEnsName(name),
      });
    } catch {
      return null;
    }
  }

  /** Read a single text record from an ENS name's resolver. */
  async getEnsTextRecord(
    name: string,
    key: string,
  ): Promise<string | null> {
    if (!this.ensPublicClient) return null;
    try {
      return await getEnsText(this.ensPublicClient, {
        name: this.normalizeEnsName(name),
        key,
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve identity through ENS and read policy from the execution chain.
   * The registry cannot enumerate selectors. Supply the target/selector pairs to check.
   */
  async resolveAgent(
    name: string,
    selectors: ReadonlyArray<{ target: Address; selector: Hex }> = [],
  ): Promise<AgentPermission | null> {
    if (!this.ensPublicClient) return null;

    const normalized = this.normalizeEnsName(name);
    const [accountRecord, keyRecord] = await Promise.all([
      this.getEnsTextRecord(normalized, "axon.account"),
      this.getEnsTextRecord(normalized, "axon.agentKey"),
    ]);
    if (!accountRecord || !keyRecord ||
        !isAddress(accountRecord, { strict: false }) || !isAddress(keyRecord, { strict: false })) return null;

    const account = getAddress(accountRecord);
    const agentKey = getAddress(keyRecord);
    const grant = await this.getGrant(account);
    if (grant.agentKey.toLowerCase() !== agentKey.toLowerCase()) return null;
    const allowed = await Promise.all(selectors.map(({ target, selector }) => this.isAllowed(target, selector, account)));

    return {
      name: normalized,
      account,
      agentKey,
      active: grant.active,
      budget: grant.budgetPerEpoch,
      version: grant.version,
      allowlist: selectors.filter((_, index) => allowed[index]),
      textRecords: {},
    };
  }

  async getVaultState(): Promise<VaultState> {
    const read = <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
      this.publicClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;

    const [deposits, position, lastActionAt, maxTrade, cooldown, maxOracleAge, maxSlippageBps, price, oracleUpdatedAt, block] =
      await Promise.all([
        read<bigint>(this.config.vault, VAULT_ABI, "deposits", [this.config.account]),
        read<bigint>(this.config.vault, VAULT_ABI, "position", [this.config.account]),
        read<bigint>(this.config.vault, VAULT_ABI, "lastActionAt", [this.config.account]),
        read<bigint>(this.config.vault, VAULT_ABI, "MAX_TRADE"),
        read<bigint>(this.config.vault, VAULT_ABI, "COOLDOWN"),
        read<bigint>(this.config.vault, VAULT_ABI, "MAX_ORACLE_AGE"),
        read<bigint>(this.config.vault, VAULT_ABI, "MAX_SLIPPAGE_BPS"),
        read<bigint>(this.config.oracle, ORACLE_ABI, "price"),
        read<bigint>(this.config.oracle, ORACLE_ABI, "updatedAt"),
        this.publicClient.getBlock({ blockTag: "latest" }),
      ]);

    return {
      deposits,
      position,
      lastActionAt,
      maxTrade,
      cooldown,
      maxOracleAge,
      maxSlippageBps,
      price,
      oracleUpdatedAt,
      blockTimestamp: block.timestamp,
    };
  }

  // -------------------------------------------------------------------
  // Intent construction
  // -------------------------------------------------------------------

  async buildIntent(
    action: ManifestAction,
    rawArgs: Record<string, unknown>,
    opts: { value?: bigint; spend?: bigint; deadlineSeconds?: number; grantHash?: Hex } = {},
  ): Promise<Intent> {
    const grant = await this.getGrant();
    const grantHash = opts.grantHash ?? grant.grantHash;
    if (opts.grantHash == null && !grant.active) throw new Error("grant is not active");
    const nonce = await this.getIntentNonce();
    const now = await this.getBlockTimestamp();
    const call = encodeActionCall(action, coerceArgs(action, rawArgs));

    return {
      target: action.address ?? (() => {
        throw new Error(`${action.id} has no deployed address in the manifest`);
      })(),
      selector: call.slice(0, 10) as Hex,
      args: `0x${call.slice(10)}` as Hex,
      value: opts.value ?? 0n,
      spend: opts.spend ?? opts.value ?? 0n,
      nonce,
      deadline: now + BigInt(opts.deadlineSeconds ?? 3600),
      grantHash,
    };
  }

  // -------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------

  private async txNonce(): Promise<bigint> {
    const n = await this.rpc<string>(this.config.rpc, "eth_getTransactionCount", [this.config.account, "latest"]);
    return BigInt(n);
  }

  async prepare(intent: Intent, intentData?: Hex): Promise<{ tx: FrameTx; raw: Hex; json: FrameTxJson }> {
    const tx = buildSignedAgentTx({
      account: this.config.account,
      agentKey: this.agentAddress,
      agentPrivateKey: this.config.agentPrivateKey,
      intent,
      intentData,
      chainId: BigInt(this.config.chainId),
      nonceSeq: await this.txNonce(),
    });
    return { tx, raw: bytesToHex(encodeFrameTx(tx)), json: toFrameTxJson(tx) };
  }

  /**
   * Simulate an intent. Pass a `prepared` transaction to replay *exactly* the
   * bytes that were simulated earlier — the revocation demo relies on this.
   */
  async simulateIntent(
    intent: Intent,
    opts: { prepared?: { raw: Hex } } = {},
  ): Promise<{ result: SimulateResult; raw: Hex }> {
    const raw = opts.prepared?.raw ?? (await this.prepare(intent)).raw;
    const result = await this.rpc<SimulateResult>(this.config.rpc, "ethrex_simulateFrameTransaction", [
      raw,
      "latest",
      { trace: true },
    ]);
    return { result, raw };
  }

  async submitIntent(
    intent: Intent,
    opts: { timeoutMs?: number; pollMs?: number; prepared?: { raw: Hex; json: FrameTxJson } } = {},
  ): Promise<SubmitResult> {
    const prepared = opts.prepared ?? (await this.prepare(intent));
    const hash = await this.rpc<Hex>(this.config.sidecar, "eth_sendFrameTransaction", [prepared.json]);
    const status = await this.waitForStatus(hash, opts.timeoutMs ?? 90_000, opts.pollMs ?? 3_000);
    return { hash, status, raw: prepared.raw, tx: prepared.json };
  }

  async waitForStatus(hash: Hex, timeoutMs = 90_000, pollMs = 3_000): Promise<IntentStatus> {
    const settled = new Set(["OnChain", "Finalized", "Reverted", "Cancelled"]);
    const deadline = Date.now() + timeoutMs;
    let last: IntentStatus = "New";
    while (Date.now() < deadline) {
      const res = await this.rpc<{ status: IntentStatus }>(this.config.sidecar, "skandha_frameTransactionStatus", [hash]);
      last = res.status;
      if (settled.has(last)) return last;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return last;
  }

  async getAdmission(hash: Hex): Promise<ExplorerAdmission | null> {
    const rec = await this.rpc<{ admission?: ExplorerAdmission }>(
      this.config.sidecar,
      "skandha_explorer_getTransaction",
      [hash],
    );
    return rec.admission ?? null;
  }

  // -------------------------------------------------------------------
  // Explanations
  // -------------------------------------------------------------------

  /** Turn a revert reason, admission code, or raw error into an actionable sentence. */
  explain(reason: string | null | undefined): string {
    if (reason == null || reason === "") return "no reason given";
    const code = reason.startsWith("0x") ? ascii(reason) : reason;
    if (code in REASONS) return `${code}: ${REASONS[code]}`;
    if (code.startsWith("Storage")) return `${code}: validation read storage outside the account (public-mempool rule)`;
    if (code.startsWith("OP-")) return `${code}: a banned opcode appeared in the validation prefix`;
    return code;
  }
}

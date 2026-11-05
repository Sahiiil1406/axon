/**
 * The demo transaction: a 2-frame, agent-native smart-account transaction.
 *
 *   frame 0  VERIFY  flags=0x3  target=sender  validate(intent)
 *   frame 1  SENDER  flags=0x0  target=sender  execute(intent)
 *
 * The agent's authority travels in the transaction's signature list: entry 0 is a
 * SECP256K1 signature over the canonical transaction hash with an explicit
 * `signer`, so the node authenticates the agent before any frame runs. Frame 0
 * reads that resolved signer back with `SIGPARAM` — no `ecrecover` in validation,
 * which this devnet's empty precompile list would reject.
 *
 *   npx tsx scripts/send-agent-tx.ts --simulate
 *   npx tsx scripts/send-agent-tx.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeAbiParameters,
  encodeFunctionData,
  parseEther,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "../src/frame/rlp.ts";
import { encodeFrameTx, computeSigHash } from "../src/frame/encoder.ts";
import { Mode, Scope, Scheme, type FrameTx } from "../src/frame/types.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "contracts/out");
const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const SIDECAR = process.env.SIDECAR ?? "https://altmempool.forshtat.com/rpc";

const OWNER_PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const AGENT_PK = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const REGISTRY = process.env.REGISTRY_ADDRESS as Address;
const ORACLE = process.env.ORACLE_ADDRESS as Address;
const VAULT = process.env.VAULT_ADDRESS as Address;
const ACCOUNT = process.env.ACCOUNT_ADDRESS as Address;
const STAKING = (process.env.STAKING_REGISTRY ?? "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f") as Address;
if (!OWNER_PK || !AGENT_PK) throw new Error("DEPLOYER_PRIVATE_KEY and AGENT_PRIVATE_KEY are required");

const simulateOnly = process.argv.includes("--simulate");

const argValue = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next != null && !next.startsWith("--") ? next : fallback;
};

/** Write `{ raw, tx, sim?, state?, hash? }` for the admission simulator. */
const emitPath = argValue("--emit");
const writeFixture = (body: Record<string, unknown>) => {
  if (emitPath == null) return;
  mkdirSync(dirname(resolve(emitPath)), { recursive: true });
  writeFileSync(resolve(emitPath), `${JSON.stringify(body, null, 2)}\n`);
  console.log("fixture   ", resolve(emitPath));
};

const chain = {
  id: 1337,
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const owner = privateKeyToAccount(OWNER_PK);
const agent = privateKeyToAccount(AGENT_PK);
const wallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });

const abiOf = (name: string): Abi =>
  JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), "utf8")).abi;

const registryAbi = abiOf("PermissionRegistry");
const accountAbi = abiOf("AgentAccount");
const oracleAbi = abiOf("MockOracle");
const stakingAbi = [
  {
    type: "function",
    name: "getDepositInfo",
    stateMutability: "view",
    inputs: [{ name: "entity", type: "address" }],
    outputs: [
      { name: "stake", type: "uint256" },
      { name: "unstakeDelaySec", type: "uint32" },
      { name: "withdrawTime", type: "uint256" },
    ],
  },
] as const;

const INTENT_TUPLE = {
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

// Refresh the oracle so the vault's MAX_ORACLE_AGE (60s) check passes.
{
  const hash = await wallet.writeContract({
    address: ORACLE,
    abi: oracleAbi,
    functionName: "setPrice",
    args: [10n ** 18n],
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("oracle refreshed", hash);
}

const grant = (await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "current",
  args: [ACCOUNT],
})) as any;
if (!grant.active) throw new Error("grant is not active — run setup.ts first");

const intentNonce = (await publicClient.readContract({
  address: ACCOUNT,
  abi: accountAbi,
  functionName: "intentNonce",
})) as bigint;

const amount = parseEther(argValue("--amount", "0.02")!);
// `spend` is the budget the intent claims, in the owner's unit. It normally
// equals `amount`; the override exists to exercise the body-frame budget guard
// without moving that much value.
const spend = parseEther(argValue("--spend", argValue("--amount", "0.02")!));
const minOut = (amount * 95n) / 100n; // oracle price 1e18, 5% max slippage
const selector = toFunctionSelector("rebalance(uint256,uint256)");
const args = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [amount, minOut]);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

// Snapshot the state the simulator's agent rules read. Without it a checked-in
// fixture starts failing `agent:grant-freshness` and `agent:budget` after the
// grant changes or the intent's one-hour deadline passes.
const blockTimestamp = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
const sidecarConfig = await rpc(SIDECAR, "skandha_config", []).catch(() => null);
const [stake] = (await publicClient.readContract({
  address: STAKING,
  abi: stakingAbi,
  functionName: "getDepositInfo",
  args: [ACCOUNT],
})) as readonly [bigint, number, bigint];
const allowlisted = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "isAllowed",
  args: [ACCOUNT, VAULT, selector],
});
const epoch = grant.epochLength > 0n ? blockTimestamp / grant.epochLength : 0n;
const spent = (await publicClient.readContract({
  address: ACCOUNT,
  abi: accountAbi,
  functionName: "spentInEpoch",
  args: [epoch],
})) as bigint;
const stateSnapshot = {
  blockTimestamp: blockTimestamp.toString(),
  stake: stake.toString(),
  allowlisted,
  spent: spent.toString(),
  config: sidecarConfig ?? undefined,
  grant: {
    owner: grant.owner,
    agentKey: grant.agentKey,
    keyScheme: Number(grant.keyScheme),
    budgetPerEpoch: grant.budgetPerEpoch.toString(),
    epochLength: grant.epochLength.toString(),
    expiresAt: grant.expiresAt.toString(),
    active: grant.active,
    version: grant.version.toString(),
    grantHash: grant.grantHash,
  },
};

const intent = {
  target: VAULT,
  selector,
  args,
  value: 0n,
  spend,
  nonce: intentNonce,
  deadline,
  grantHash: grant.grantHash,
} as const;

const validateData = encodeFunctionData({
  abi: accountAbi,
  functionName: "validate",
  args: [encodeAbiParameters([INTENT_TUPLE], [intent])],
});

const executeData = encodeFunctionData({
  abi: accountAbi,
  functionName: "execute",
  args: [encodeAbiParameters([INTENT_TUPLE], [intent])],
});

const txNonce = BigInt(await rpc(RPC, "eth_getTransactionCount", [ACCOUNT, "latest"]));

const tx: FrameTx = {
  chainId: 1337n,
  nonceKeys: [0n],
  nonceSeq: txNonce,
  sender: ACCOUNT,
  frames: [
    {
      mode: Mode.VERIFY,
      flags: Scope.EXECUTION_AND_PAYMENT,
      target: null,
      limits: { execution: 80_000n, state: 0n },
      value: 0n,
      data: hexToBytes(validateData),
    },
    {
      mode: Mode.SENDER,
      flags: 0,
      target: null,
      // The body frame writes three storage slots in the vault; on the Amsterdam
      // gas model SSTORE growth is charged from the separate state budget.
      limits: { execution: 500_000n, state: 500_000n },
      value: 0n,
      data: hexToBytes(executeData),
    },
  ],
  // Two entries, and the order is load-bearing: `validate` reads
  // SIGPARAM_RESOLVED_SIGNER(0), so the agent's witness must be entry 0.
  //
  //   [0] SECP256K1 with an explicit `signer`: the node verifies the agent's
  //       signature over the canonical transaction hash *before* any frame runs.
  //   [1] ARBITRARY with an empty signer: the structural witness that this
  //       contract sender's authority is decided by its own code.
  //
  // The raw bytes of both are elided from the signing hash (empty `msg`), so the
  // hash is stable no matter what signature bytes end up in entry 0.
  signatures: [
    {
      scheme: Scheme.SECP256K1,
      signer: agent.address,
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
  fees: {
    maxPriorityFeePerGas: 1n,
    maxFeePerGas: 9n,
    maxFeePerBlobGas: 0n,
  },
  blobVersionedHashes: [],
  recentRootReferences: [],
};

// The agent signs the frame transaction itself, not a separate intent digest:
// the transaction commits to the intent (it is the frames' calldata) and to the
// agent's own signer entry. Wire format <y-parity><r><s>; `prehash: false`
// because `sigHash` is already the digest.
const sigHash = computeSigHash(tx, "empty");
const agentSig = secp256k1.sign(sigHash, hexToBytes(AGENT_PK.replace(/^0x/, "")), {
  format: "recovered",
  prehash: false,
});
tx.signatures[0].signature = agentSig;

console.log("account   ", ACCOUNT);
console.log("agent     ", agent.address);
console.log("txNonce   ", txNonce.toString());
console.log("intentNonce", intentNonce.toString());
console.log("grantHash ", grant.grantHash);
console.log("sigHash   ", bytesToHex(sigHash));
console.log("agentSig  ", bytesToHex(agentSig));

const raw = bytesToHex(encodeFrameTx(tx));

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
    {
      scheme: Scheme.SECP256K1,
      signer: agent.address,
      msg: "0x",
      signature: bytesToHex(agentSig),
    },
    { scheme: Scheme.ARBITRARY, signer: "0x", msg: "0x", signature: "0x" },
  ],
  fees: {
    maxPriorityFeePerGas: hex(tx.fees.maxPriorityFeePerGas),
    maxFeePerGas: hex(tx.fees.maxFeePerGas),
    maxFeePerBlobGas: hex(tx.fees.maxFeePerBlobGas),
  },
  blobVersionedHashes: [] as string[],
  recentRootReferences: [] as unknown[],
};

if (simulateOnly) {
  const sim = await rpc(RPC, "ethrex_simulateFrameTransaction", [raw, "latest", { trace: true }]);
  writeFixture({ raw, tx: json, sim, state: stateSnapshot });
  console.log(JSON.stringify(sim, null, 2));
  process.exit(sim.executionStatus === "success" ? 0 : 1);
}

// Capture the pre-send trace when asked for a fixture: after inclusion the
// nonce has moved on and a fresh simulation would fail for an unrelated reason.
let presendSim: unknown;
if (emitPath != null) {
  presendSim = await rpc(RPC, "ethrex_simulateFrameTransaction", [raw, "latest", { trace: true }]);
  writeFixture({ raw, tx: json, sim: presendSim, state: stateSnapshot });
}

const hash = await rpc(SIDECAR, "eth_sendFrameTransaction", [json]);
console.log("txHash   ", hash);
writeFixture({ raw, tx: json, sim: presendSim, hash, state: stateSnapshot });

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const status = await rpc(SIDECAR, "skandha_frameTransactionStatus", [hash]);
  console.log(`[${i}] ${status.status}`);
  if (["OnChain", "Finalized", "Reverted", "Cancelled"].includes(status.status)) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.status === "Reverted" ? 1 : 0);
  }
}

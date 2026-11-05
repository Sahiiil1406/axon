/**
 * Beat 5 — the mirror trade-off, on the devnet.
 *
 * Deploys two accounts with the same grant:
 *
 *   live    AgentAccount        reads PermissionRegistry on every check
 *   mirror  MirrorAgentAccount  enforces a local copy pushed by syncGrant
 *
 * Then it revokes both grants and replays the *same signed frame transaction*
 * built before revocation:
 *
 *   live    admission fails immediately: E_GRANT_INACTIVE
 *   mirror  still admits and executes, because its copy says active
 *
 * The main demo account is never touched.
 *
 *   npx tsx scripts/demo-revocation.ts
 *   npx tsx scripts/demo-revocation.ts --no-submit --emit ../final/data/revocation.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEther,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AxonClient, type SimulateResult } from "../src/client.ts";
import { findAction, loadManifest } from "../src/manifest.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "contracts/out");

// Minimal .env reader so this script runs standalone.
for (const raw of existsSync(resolve(ROOT, ".env")) ? readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/) : []) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#") || !line.includes("=")) continue;
  const key = line.slice(0, line.indexOf("=")).trim();
  if (process.env[key] === undefined) process.env[key] = line.slice(line.indexOf("=") + 1).trim();
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next != null && !next.startsWith("--") ? next : fallback;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") throw new Error(`${name} is required`);
  return v;
}

const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const SIDECAR = process.env.SIDECAR ?? "https://altmempool.forshtat.com/rpc";
const REGISTRY = requireEnv("REGISTRY_ADDRESS") as Address;
const ORACLE = requireEnv("ORACLE_ADDRESS") as Address;
const VAULT = requireEnv("VAULT_ADDRESS") as Address;
const STAKING = (process.env.STAKING_REGISTRY ?? "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f") as Address;
const PK = requireEnv("DEPLOYER_PRIVATE_KEY") as Hex;
const AGENT_PK = requireEnv("AGENT_PRIVATE_KEY") as Hex;

const chain = {
  id: 1337,
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const owner = privateKeyToAccount(PK);
const agent = privateKeyToAccount(AGENT_PK);
const wallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });

const artifact = (name: string): { abi: Abi; bytecode: Hex } => {
  const path = resolve(OUT, `${name}.sol/${name}.json`);
  if (!existsSync(path)) throw new Error(`missing ${path} — run \`forge build\` first`);
  const json = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
};

const REGISTRY_ABI = [
  { type: "function", name: "grantAgent", stateMutability: "nonpayable", inputs: [
    { name: "account", type: "address" }, { name: "agentKey", type: "address" }, { name: "keyScheme", type: "uint8" },
    { name: "budgetPerEpoch", type: "uint128" }, { name: "epochLength", type: "uint64" }, { name: "expiresAt", type: "uint64" },
  ], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "allow", stateMutability: "nonpayable", inputs: [
    { name: "account", type: "address" }, { name: "target", type: "address" }, { name: "selector", type: "bytes4" },
  ], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [{ name: "account", type: "address" }], outputs: [] },
  { type: "function", name: "current", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [
    { type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "agentKey", type: "address" }, { name: "keyScheme", type: "uint8" },
      { name: "budgetPerEpoch", type: "uint128" }, { name: "epochLength", type: "uint64" }, { name: "expiresAt", type: "uint64" },
      { name: "active", type: "bool" }, { name: "version", type: "uint256" }, { name: "grantHash", type: "bytes32" },
    ] },
  ] },
] as const;

const MIRROR_ABI = [
  { type: "function", name: "syncGrant", stateMutability: "nonpayable", inputs: [
    { name: "targets", type: "address[]" }, { name: "selectors", type: "bytes4[]" },
  ], outputs: [] },
  { type: "function", name: "mirroredGrant", stateMutability: "view", inputs: [], outputs: [
    { type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "agentKey", type: "address" }, { name: "keyScheme", type: "uint8" },
      { name: "budgetPerEpoch", type: "uint128" }, { name: "epochLength", type: "uint64" }, { name: "expiresAt", type: "uint64" },
      { name: "active", type: "bool" }, { name: "version", type: "uint256" }, { name: "grantHash", type: "bytes32" },
    ] },
  ] },
  { type: "function", name: "stake", stateMutability: "payable", inputs: [
    { name: "stakingRegistry", type: "address" }, { name: "unstakeDelaySec", type: "uint32" },
  ], outputs: [] },
  { type: "function", name: "setupCall", stateMutability: "nonpayable", inputs: [
    { name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
  ], outputs: [] },
] as const;

const VAULT_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "position", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
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

const ACCOUNT_ABI = [
  {
    type: "function",
    name: "checkAuthority",
    stateMutability: "view",
    inputs: [{ name: "i", ...INTENT_TUPLE }, { name: "agentKey", type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

const ORACLE_ABI = [
  { type: "function", name: "setPrice", stateMutability: "nonpayable", inputs: [{ name: "price_", type: "uint256" }], outputs: [] },
] as const;

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw new Error(`${label} failed after retries: ${(last as Error).message ?? last}`);
}

async function send(hash: Hex, label: string): Promise<void> {
  const receipt = await withRetry(`receipt ${label}`, () =>
    publicClient.waitForTransactionReceipt({ hash }),
  );
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
}

async function write(address: Address, abi: Abi, functionName: string, args: unknown[], value?: bigint): Promise<Hex> {
  const hash = await withRetry(`send ${functionName}`, () =>
    wallet.writeContract({ address, abi, functionName, args, value, gas: 20_000_000n } as never),
  );
  await send(hash, functionName);
  return hash;
}

function deploy(name: string, constructorArgs: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  return withRetry(`deploy ${name}`, () =>
    wallet
      .deployContract({ abi, bytecode, args: constructorArgs, gas: 20_000_000n })
      .then(async (hash) => {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (!receipt.contractAddress) throw new Error(`${name} deploy failed`);
        return receipt.contractAddress;
      }),
  );
}

const short = (result: SimulateResult): string => {
  if (result.executionStatus === "success") return "success";
  const error = result.executionError ?? "reverted";
  return typeof error === "string" && error.startsWith("0x")
    ? `revert ${Buffer.from(error.slice(2), "hex").toString("ascii").replace(/[^\x20-\x7e]+/g, " ").trim() || error}`
    : String(error);
};

const decodeReason = (value: Hex): string => {
  const text = Buffer.from(value.slice(2), "hex").toString("ascii").replace(/\0+$/, "");
  return text === "" ? "OK" : text;
};

async function main(): Promise<void> {
  const manifest = loadManifest(resolve(ROOT, "codegen/manifest.json"));
  const rebalance = findAction(manifest, "AgentVault.rebalance");
  const selector = rebalance.selector as Hex;

  console.log("deploying live twin and mirror…");
  const live = await deploy("AgentAccount", [owner.address, REGISTRY]);
  const mirror = await deploy("MirrorAgentAccount", [owner.address, REGISTRY]);
  console.log("  live  ", live);
  console.log("  mirror", mirror);

  const now = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
  const budget = parseEther("0.5");
  const epoch = 86_400;
  const expiresAt = now + 7n * 86_400n;

  for (const account of [live, mirror]) {
    await write(REGISTRY, REGISTRY_ABI, "grantAgent", [account, agent.address, 1, budget, epoch, expiresAt]);
    await write(REGISTRY, REGISTRY_ABI, "allow", [account, VAULT, selector]);
  }
  await write(mirror, MIRROR_ABI, "syncGrant", [[VAULT], [selector]]);

  // Both twins need stake (validation reads the oracle), gas, and a vault deposit
  // so the only difference between them is where the grant comes from.
  for (const account of [live, mirror]) {
    await send(
      await withRetry(`fund ${account}`, () =>
        wallet.sendTransaction({ to: account, value: parseEther("0.2") }),
      ),
      `fund ${account}`,
    );
    await write(account, MIRROR_ABI, "stake", [STAKING, 86_400], parseEther("0.02"));
    await write(account, MIRROR_ABI, "setupCall", [
      VAULT,
      parseEther("0.05"),
      encodeFunctionData({ abi: VAULT_ABI, functionName: "deposit" }),
    ]);
  }
  await write(ORACLE, ORACLE_ABI, "setPrice", [10n ** 18n]);

  const mirrorGrant = (await publicClient.readContract({
    address: mirror, abi: MIRROR_ABI, functionName: "mirroredGrant",
  })) as { grantHash: Hex; version: bigint; active: boolean };
  const liveGrant = (await publicClient.readContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "current", args: [live],
  })) as { grantHash: Hex; version: bigint; active: boolean };

  const clientFor = (account: Address) =>
    new AxonClient({
      account,
      registry: REGISTRY,
      vault: VAULT,
      oracle: ORACLE,
      agentPrivateKey: AGENT_PK,
      chainId: 1337,
      rpc: RPC,
      sidecar: SIDECAR,
      stakingRegistry: STAKING,
    });

  const mirrorClient = clientFor(mirror);
  const liveClient = clientFor(live);

  const amount = parseEther("0.02");
  const minOut = parseEther("0.019");
  const callArgs = { amount: amount.toString(), minOut: minOut.toString() };

  // Build and sign once, before revocation, then replay the exact bytes.
  const mirrorIntent = await mirrorClient.buildIntent(rebalance, callArgs, {
    spend: amount,
    grantHash: mirrorGrant.grantHash,
  });
  const liveIntent = await liveClient.buildIntent(rebalance, callArgs, {
    spend: amount,
    grantHash: liveGrant.grantHash,
  });
  const preparedMirror = await mirrorClient.prepare(mirrorIntent);
  const preparedLive = await liveClient.prepare(liveIntent);

  console.log("\nbefore revocation");
  const mirrorBefore = await mirrorClient.simulateIntent(mirrorIntent, { prepared: preparedMirror });
  const liveBefore = await liveClient.simulateIntent(liveIntent, { prepared: preparedLive });
  console.log(`  mirror ${short(mirrorBefore.result)}`);
  console.log(`  live   ${short(liveBefore.result)}`);

  console.log("\nrevoking both grants (owner)…");
  await write(REGISTRY, REGISTRY_ABI, "revoke", [live]);
  await write(REGISTRY, REGISTRY_ABI, "revoke", [mirror]);

  console.log("\nafter revocation — same signed bytes");
  const mirrorAfter = await mirrorClient.simulateIntent(mirrorIntent, { prepared: preparedMirror });
  const liveAfter = await liveClient.simulateIntent(liveIntent, { prepared: preparedLive });

  const ruleFor = async (account: Address, intent: typeof mirrorIntent): Promise<string> =>
    decodeReason(
      (await publicClient.readContract({
        address: account,
        abi: ACCOUNT_ABI,
        functionName: "checkAuthority",
        args: [intent, agent.address],
      } as never)) as Hex,
    );
  const mirrorRule = await ruleFor(mirror, mirrorIntent);
  const liveRule = await ruleFor(live, liveIntent);

  console.log(`  mirror ${short(mirrorAfter.result)}   (local grant ${mirrorRule})`);
  console.log(`  live   ${short(liveAfter.result)}   (registry ${liveRule})`);

  let submission: { hash: Hex; status: string } | null = null;
  if (flag("--no-submit")) {
    console.log("\n--no-submit: stopping before the mirror transaction is sent");
  } else {
    console.log("\nsubmitting the stale mirror transaction…");
    const result = await mirrorClient.submitIntent(mirrorIntent, {
      prepared: preparedMirror,
      timeoutMs: 120_000,
    });
    submission = { hash: result.hash, status: result.status };
    console.log(`  ${result.hash} → ${result.status}`);
  }

  const position = (await publicClient.readContract({
    address: VAULT, abi: VAULT_ABI, functionName: "position", args: [mirror],
  })) as bigint;

  const body = {
    version: 1,
    kind: "revocation-demo",
    generatedAt: new Date().toISOString(),
    network: "eip8141-altmempool-devnet",
    accounts: { live, mirror, owner: owner.address, agent: agent.address },
    grant: { budget: budget.toString(), epoch: String(epoch), expiresAt: expiresAt.toString() },
    mirrorGrantVersion: mirrorGrant.version.toString(),
    liveGrantVersion: liveGrant.version.toString(),
    before: {
      mirror: short(mirrorBefore.result),
      live: short(liveBefore.result),
    },
    after: {
      mirror: short(mirrorAfter.result),
      live: short(liveAfter.result),
      liveError: liveAfter.result.executionError,
      mirrorRule,
      liveRule,
      mirrorCanonicalMempoolValid: mirrorAfter.result.canonicalMempoolValid,
    },
    submission,
    mirrorPosition: position.toString(),
    prepared: { mirror: preparedMirror.raw, live: preparedLive.raw },
  };

  const emit = resolve(ROOT, value("--emit", "final/data/revocation.json")!);
  mkdirSync(dirname(emit), { recursive: true });
  writeFileSync(emit, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`\nwrote ${emit}`);

  if (flag("--save")) {
    const path = resolve(ROOT, "deployments.json");
    const deployments = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown> & {
      accounts: Record<string, string>;
    };
    deployments.accounts.MirrorAgentAccount = mirror;
    deployments.accounts.LiveTwinAccount = live;
    writeFileSync(path, `${JSON.stringify(deployments, null, 2)}\n`);
    console.log(`saved accounts to ${path}`);
  }

  if (
    liveAfter.result.executionStatus === "success" ||
    mirrorAfter.result.executionStatus !== "success" ||
    liveRule !== "E_GRANT_INACTIVE" ||
    mirrorRule !== "OK"
  ) {
    console.error("\nthe demo did not produce the expected split (live reject, mirror admit)");
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(2);
});

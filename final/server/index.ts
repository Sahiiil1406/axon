import { signRequest } from "@worldcoin/idkit-core/signing";
/**
 * FinalCounter demo server.
 *
 *   ./serve.sh
 *
 * Serves the demo frontend and executes both lanes server-side:
 *   - human: ordinary EOA transaction from DEPLOYER_PRIVATE_KEY
 *   - agent: EIP-8141 VERIFY + SENDER frame transaction from the Axon SDK
 *
 * Keys stay on 127.0.0.1. This is a devnet demo, not a production signer.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  hexToString,
  encodeAbiParameters,
  formatEther,
  http,
  parseEther,
  parseAbi,
  getAddress,
  isAddress,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEnsText, normalize } from "viem/ens";
import { AxonClient } from "@axon/sdk";
import { openAgentStore } from "./agent-store.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");
const WEB = resolve(ROOT, "frontend/dist");
const envFile = [resolve(HERE, ".env"), resolve(ROOT, ".env"), resolve(ROOT, "../.env")].find(existsSync);
if (envFile) process.loadEnvFile(envFile);

interface Deployment {
  chainId?: number;
  rpc?: string;
  sidecar?: string;
  registry?: Address;
  agentAccount?: Address;
  counter?: Address;
}
const deploymentFile = process.env.FINAL_DEPLOYMENTS_FILE ?? [
  resolve(ROOT, "deployment.json"),
  resolve(ROOT, "contract/deployments.json"),
  resolve(HERE, "deployments.json"),
  resolve(ROOT, "deployments.json"),
].find(existsSync);
const deployment: Deployment = deploymentFile
  ? JSON.parse(readFileSync(deploymentFile, "utf8")) as Deployment
  : {};

// The server only needs this public ABI; running it does not require a Foundry build.
const counterAbi = parseAbi([
  "function snapshot() view returns (uint256 humanCount, uint256 agentCount, uint256 humanPaid, uint256 agentPaid, uint256 humanPayments, uint256 agentPayments, uint8 lastLane, address lastCaller)",
  "function HUMAN_PRICE() view returns (uint256)",
  "function AGENT_PRICE() view returns (uint256)",
  "function increment() returns (uint8 lane, uint256 step)",
  "function pay() payable returns (uint8 lane, uint256 step)",
  "function payAmount(uint256 amount) payable returns (uint8 lane, uint256 step)",
]);

const RPC = process.env.RPC ?? deployment.rpc;
const SIDECAR = process.env.SIDECAR ?? deployment.sidecar;
if (!RPC) throw new Error("RPC is required in the server environment or deployment file");
if (!SIDECAR) throw new Error("SIDECAR is required in the server environment or deployment file");
const CHAIN_ID = Number(process.env.CHAIN_ID ?? deployment.chainId ?? 1337);
const PORT = Number(process.env.FINAL_PORT ?? process.env.PORT ?? 8900);
const API_ONLY = process.env.FINAL_API_ONLY === "true";
const HOST = process.env.FINAL_HOST ?? process.env.HOST ?? "127.0.0.1";
const worldIdTestSkip = process.env.WORLD_ID_TEST_SKIP === "true" &&
  process.env.NODE_ENV !== "production" &&
  ["127.0.0.1", "localhost", "::1"].includes(HOST);
if (!Number.isSafeInteger(CHAIN_ID) || CHAIN_ID <= 0) throw new Error("CHAIN_ID must be a positive integer");
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FINAL_PORT must be between 1 and 65535");
const EXPLORER = "https://altmempoolexplorer.forshtat.com/tx/";

// ENSv2 (Sepolia) — agent identity & permission control plane
const SEPOLIA_RPC = process.env.SEPOLIA_RPC;
const configuredSepoliaOwnerKey = process.env.SEPOLIA_OWNER_PRIVATE_KEY?.trim();
const SEPOLIA_OWNER_PK = configuredSepoliaOwnerKey?.replace(/^(?:0x)?/i, "0x");
const configuredEnsRegistry = process.env.ENS_REGISTRY?.trim();
const ENS_REGISTRY = configuredEnsRegistry && isAddress(configuredEnsRegistry, { strict: false })
  ? getAddress(configuredEnsRegistry)
  : undefined;
const HUMAN_ENS_NAME = process.env.HUMAN_ENS_NAME; // e.g. "alice.eth"
const WORLD_ID_APP_ID = process.env.WORLD_ID_APP_ID?.trim();
const WORLD_ID_RP_ID = process.env.WORLD_ID_RP_ID?.trim();
const WORLD_ID_VERIFIER_URL = process.env.WORLD_ID_VERIFIER_URL?.trim().replace(/\/+$/, "") || "https://developer.world.org/api/v4";
const worldIdSignerAddress = process.env.WORLD_ID_SIGNER_ADDRESS?.trim();
const worldIdSigningKey = process.env.WORLD_ID_RP_SIGNING_KEY?.trim().replace(/^(?:0x)?/i, "0x");
const worldIdNonces = new Map<string, number>();

function worldIdConfigurationError(): string | undefined {
  if (!/^app_[a-f0-9]{32}$/i.test(WORLD_ID_APP_ID ?? "")) return "Set WORLD_ID_APP_ID to the production App ID.";
  if (!/^rp_[a-f0-9]{16}$/i.test(WORLD_ID_RP_ID ?? "")) return "Set WORLD_ID_RP_ID to the portal's Relying Party ID.";
  if (!worldIdSigningKey || !/^0x[a-f0-9]{64}$/i.test(worldIdSigningKey))
    return "Set WORLD_ID_RP_SIGNING_KEY in final/server/.env to the RP signing key from the portal.";
  try {
    const signer = privateKeyToAccount(worldIdSigningKey as Hex).address;
    if (signer.toLowerCase() !== worldIdSignerAddress?.toLowerCase())
      return "WORLD_ID_RP_SIGNING_KEY must match WORLD_ID_SIGNER_ADDRESS.";
  } catch {
    return "WORLD_ID_RP_SIGNING_KEY is invalid.";
  }
}
const worldIdError = worldIdConfigurationError();

let ensPublicClient: PublicClient | undefined;
let ensOwnerWallet: ReturnType<typeof createWalletClient> | undefined;
if (SEPOLIA_RPC) {
  ensPublicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
}
if (SEPOLIA_OWNER_PK && /^0x[0-9a-fA-F]{64}$/.test(SEPOLIA_OWNER_PK) && ensPublicClient) {
  ensOwnerWallet = createWalletClient({
    account: privateKeyToAccount(SEPOLIA_OWNER_PK as Hex),
    chain: sepolia,
    transport: http(SEPOLIA_RPC),
  });
}

function privateKey(name: string): Hex {
  const value = process.env[name];
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte private key`);
  return value as Hex;
}
function address(name: string, fallback?: Address): Address {
  const value = process.env[name] ?? fallback;
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid deployed contract address`);
  return value;
}
const OWNER_PK = privateKey("DEPLOYER_PRIVATE_KEY");
const AGENT_PK = privateKey("AGENT_PRIVATE_KEY");
const COUNTER = address("FINAL_COUNTER_ADDRESS", deployment.counter);
const REGISTRY = address("REGISTRY_ADDRESS", deployment.registry);
const ACCOUNT = address("ACCOUNT_ADDRESS", deployment.agentAccount);

const chain = {
  id: CHAIN_ID,
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const owner = privateKeyToAccount(OWNER_PK);
const wallet = createWalletClient({
  account: owner,
  chain,
  transport: http(RPC),
});
const publicClient = createPublicClient({ chain, transport: http(RPC) });

const createAgentClient = (account: Address) => new AxonClient({
  account,
  registry: REGISTRY,
  vault: COUNTER,
  oracle: COUNTER,
  agentPrivateKey: AGENT_PK,
  chainId: CHAIN_ID,
  rpc: RPC,
  sidecar: SIDECAR,
});
const agentClient = createAgentClient(ACCOUNT);

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
  {
    type: "function",
    name: "allow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "disallow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "grantAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "agentKey", type: "address" },
      { name: "keyScheme", type: "uint8" },
      { name: "budgetPerEpoch", type: "uint128" },
      { name: "epochLength", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
    ],
    outputs: [{ name: "grantHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
] as const satisfies Abi;

const ENS_TEXT_ABI = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }, { name: "key", type: "string" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

const ACCOUNT_ABI = [
  {
    type: "function",
    name: "intentNonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "spentInEpoch",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

interface GrantStruct {
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

const FUNCTIONS = [
  {
    id: "increment",
    signature: "increment()",
    selector: toFunctionSelector("increment()"),
    needsAmount: false,
    label: "increment()",
    note: "Human +1 · agent +10",
  },
  {
    id: "pay",
    signature: "pay()",
    selector: toFunctionSelector("pay()"),
    needsAmount: false,
    label: "pay()",
    note: "Human 0.001 ETH · agent 0.0001 ETH",
  },
  {
    id: "payAmount",
    signature: "payAmount(uint256)",
    selector: toFunctionSelector("payAmount(uint256)"),
    needsAmount: true,
    label: "payAmount(uint256)",
    note: "Explicit amount · agent spend counts against the grant",
  },
] as const;

type FunctionId = (typeof FUNCTIONS)[number]["id"];
type Lane = "human" | "agent";

const history: Record<string, unknown>[] = [];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const message = (error: unknown) =>
  String((error as { message?: string })?.message ?? error);
const zeroAddress = "0x0000000000000000000000000000000000000000";
const eth = (value: bigint) => formatEther(value);

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body, null, 2));
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) throw new Error("request body is too large");
  }
  if (data.trim() === "") return {};
  const parsed = JSON.parse(data) as unknown;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function readCounter() {
  const snapshot = (await publicClient.readContract({
    address: COUNTER,
    abi: counterAbi,
    functionName: "snapshot",
  })) as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    Address,
  ];

  const [
    humanCount,
    agentCount,
    humanPaid,
    agentPaid,
    humanPayments,
    agentPayments,
    lastLane,
    lastCaller,
  ] = snapshot;

  const [humanPrice, agentPrice] = await Promise.all([
    publicClient.readContract({
      address: COUNTER,
      abi: counterAbi,
      functionName: "HUMAN_PRICE",
    }) as Promise<bigint>,
    publicClient.readContract({
      address: COUNTER,
      abi: counterAbi,
      functionName: "AGENT_PRICE",
    }) as Promise<bigint>,
  ]);

  return {
    humanCount: humanCount.toString(),
    agentCount: agentCount.toString(),
    humanPaid: humanPaid.toString(),
    agentPaid: agentPaid.toString(),
    humanPayments: humanPayments.toString(),
    agentPayments: agentPayments.toString(),
    lastLane: Number(lastLane) === 1 ? "AGENT" : "HUMAN",
    lastCaller,
    humanPrice: humanPrice.toString(),
    agentPrice: agentPrice.toString(),
    humanPriceEth: eth(humanPrice),
    agentPriceEth: eth(agentPrice),
  };
}

async function readGrantRaw(account = ACCOUNT) {
  const [grant, block] = await Promise.all([
    publicClient.readContract({
      address: REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "current",
      args: [account],
    }) as Promise<GrantStruct>,
    publicClient.getBlock({ blockTag: "latest" }),
  ]);

  const epoch =
    grant.epochLength > 0n ? block.timestamp / grant.epochLength : 0n;
  const spent = (await publicClient.readContract({
    address: account,
    abi: ACCOUNT_ABI,
    functionName: "spentInEpoch",
    args: [epoch],
  })) as bigint;

  return { grant, blockTimestamp: block.timestamp, epoch, spent };
}

function serializeGrant(
  grant: GrantStruct,
  blockTimestamp: bigint,
  epoch: bigint,
  spent: bigint,
) {
  const remaining =
    spent >= grant.budgetPerEpoch ? 0n : grant.budgetPerEpoch - spent;
  return {
    owner: grant.owner,
    agentKey: grant.agentKey,
    keyScheme: Number(grant.keyScheme),
    budgetPerEpoch: grant.budgetPerEpoch.toString(),
    budgetEth: eth(grant.budgetPerEpoch),
    epochLength: grant.epochLength.toString(),
    epochLengthSec: Number(grant.epochLength),
    expiresAt: grant.expiresAt.toString(),
    expiresInSec:
      grant.expiresAt > blockTimestamp
        ? Number(grant.expiresAt - blockTimestamp)
        : 0,
    active: Boolean(grant.active),
    version: grant.version.toString(),
    grantHash: grant.grantHash,
    epoch: epoch.toString(),
    spent: spent.toString(),
    spentEth: eth(spent),
    remaining: remaining.toString(),
    remainingEth: eth(remaining),
  };
}

async function readAllowlist(account = ACCOUNT) {
  const entries = await Promise.all(
    FUNCTIONS.map(async (fn) => {
      const allowed = (await publicClient.readContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "isAllowed",
        args: [account, COUNTER, fn.selector],
      })) as boolean;
      return [fn.id, allowed] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<FunctionId, boolean>;
}

const agentStore = openAgentStore(resolve(HERE, "agent-registrations.json"));
const activeEnsRegistrations = new Set<string>();
const pendingEnsRegistrationWrites = new Map<string, { hash: Hex; value: string }>();

async function readEnsTextRecord(name: string, key: string): Promise<string | null> {
  if (!ensPublicClient) return null;
  const normalizedName = normalize(name);
  if (ENS_REGISTRY) {
    try {
      return await ensPublicClient.readContract({
        address: ENS_REGISTRY,
        abi: ENS_TEXT_ABI,
        functionName: "text",
        args: [normalizedName, key],
      });
    } catch {
      // External resolvers can still be read through the universal resolver.
    }
  }
  try {
    return await getEnsText(ensPublicClient, {
      name: normalizedName,
      key,
    });
  } catch {
    return null;
  }
}

async function resolveAgentFromEns(name: string): Promise<{
  name: string;
  account: Address | null;
  agentKey: Address | null;
  active: boolean;
  budget: bigint;
  version: bigint;
  allowlist: Array<{ target: Address; selector: Hex }>;
} | null> {
  const [account, agentKey, active, budget, version, allowlistRaw] = await Promise.all([
    readEnsTextRecord(name, "axon.account"),
    readEnsTextRecord(name, "axon.agentKey"),
    readEnsTextRecord(name, "axon.active"),
    readEnsTextRecord(name, "axon.budget"),
    readEnsTextRecord(name, "axon.version"),
    readEnsTextRecord(name, "axon.allowlist"),
  ]);

  if (!account || !agentKey) return null;

  const allowlist: Array<{ target: Address; selector: Hex }> = [];
  if (allowlistRaw) {
    for (const entry of allowlistRaw.split(",")) {
      const [target, selector] = entry.trim().split(":");
      if (target && selector && isAddress(target)) {
        allowlist.push({ target: target as Address, selector: selector as Hex });
      }
    }
  }

  return {
    name: normalize(name),
    account: account as Address,
    agentKey: agentKey as Address,
    active: active === "true",
    budget: budget ? BigInt(budget) : 0n,
    version: version ? BigInt(version) : 0n,
    allowlist,
  };
}

async function readState() {
  const [counter, grantRaw, allowlist, blockNumber, balance, intentNonce] =
    await Promise.all([
      readCounter(),
      readGrantRaw(),
      readAllowlist(),
      publicClient.getBlockNumber(),
      publicClient.getBalance({ address: ACCOUNT }),
      publicClient.readContract({
        address: ACCOUNT,
        abi: ACCOUNT_ABI,
        functionName: "intentNonce",
      }) as Promise<bigint>,
    ]);

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    worldIdTestSkip,
    worldId: worldIdError ? { error: worldIdError } : { appId: WORLD_ID_APP_ID },
    network: {
      chainId: CHAIN_ID,
      rpc: RPC,
      sidecar: SIDECAR,
      blockNumber: blockNumber.toString(),
      explorer: EXPLORER,
    },
    contracts: {
      counter: COUNTER,
      registry: REGISTRY,
      agentAccount: ACCOUNT,
      owner: owner.address,
      agentKey: agentClient.agentAddress,
    },
    counter,
    grant: serializeGrant(
      grantRaw.grant,
      grantRaw.blockTimestamp,
      grantRaw.epoch,
      grantRaw.spent,
    ),
    allowlist,
    functions: FUNCTIONS.map(
      ({ id, signature, selector, needsAmount, label, note }) => ({
        id,
        signature,
        selector,
        needsAmount,
        label,
        note,
      }),
    ),
    agentBalance: balance.toString(),
    agentBalanceEth: eth(balance),
    intentNonce: intentNonce.toString(),
    history,
    ens: await (async () => {
      if (!HUMAN_ENS_NAME) return { humanName: null, agents: [] };
      const subs = agentStore.names(normalize(HUMAN_ENS_NAME));
      const resolved = await Promise.all(
        subs.map(async (sub) => {
          const agent = await resolveAgentFromEns(sub);
          return {
            name: sub,
            registrationTxHash: agentStore.hash(sub),
            ...(agent
              ? {
                  account: agent.account,
                  agentKey: agent.agentKey,
                  active: agent.active,
                  budget: agent.budget.toString(),
                  version: agent.version.toString(),
                  allowlist: agent.allowlist,
                }
              : { unresolved: true, localPolicy: agentStore.policy(sub) }),
          };
        }),
      );
      return { humanName: HUMAN_ENS_NAME, agents: resolved };
    })(),
  };
}

async function getReceipt(hash: Hex) {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch {
    return null;
  }
}

function summarizeSimulation(result: {
  executionStatus: string | null;
  executionError: string | null;
  canonicalMempoolValid: boolean;
  canonicalMempoolViolation: string | null;
  gasUsed: string | null;
  maxCost: string | null;
  payer: string | null;
  prefixShape: string | null;
  frames: { gasUsed: string; succeeded: boolean }[] | null;
}) {
  return {
    executionStatus: result.executionStatus,
    executionError: result.executionError,
    canonicalMempoolValid: result.canonicalMempoolValid,
    canonicalMempoolViolation: result.canonicalMempoolViolation,
    gasUsed: result.gasUsed,
    maxCost: result.maxCost,
    payer: result.payer,
    prefixShape: result.prefixShape,
    frames: result.frames,
  };
}

function summarizeAdmission(
  admission: {
    id: number;
    outcome: string;
    frameStatuses?: string[];
    checks: {
      rule: string;
      verdict: string;
      frameIndex?: number;
      reason?: string;
    }[];
  } | null,
) {
  if (admission == null) return null;
  return {
    id: admission.id,
    outcome: admission.outcome,
    frameStatuses: admission.frameStatuses,
    checks: admission.checks,
    passed: admission.checks.filter((c) => c.verdict === "pass").length,
    failed: admission.checks.filter(
      (c) => c.verdict !== "pass" && c.verdict !== "skip",
    ).length,
  };
}

function functionOf(id: string) {
  const fn = FUNCTIONS.find((item) => item.id === id);
  if (!fn) throw new Error(`unknown function: ${id}`);
  return fn;
}

function parseAmount(amountEth: unknown): bigint {
  if (amountEth == null || String(amountEth).trim() === "") {
    throw new Error("amount is required for payAmount(uint256)");
  }
  const amount = parseEther(String(amountEth));
  if (amount <= 0n) throw new Error("amount must be greater than 0");
  return amount;
}

async function humanCall(fnId: FunctionId, amountWei: bigint | null) {
  const fn = functionOf(fnId);
  const before = await readCounter();
  let value = 0n;

  try {
    let hash: Hex;
    if (fnId === "increment") {
      hash = await wallet.writeContract({
        address: COUNTER,
        abi: counterAbi,
        functionName: "increment",
        args: [],
        gas: 500_000n,
      });
    } else if (fnId === "pay") {
      value = BigInt(before.humanPrice);
      hash = await wallet.writeContract({
        address: COUNTER,
        abi: counterAbi,
        functionName: "pay",
        args: [],
        value,
        gas: 500_000n,
      });
    } else {
      value = amountWei ?? 0n;
      hash = await wallet.writeContract({
        address: COUNTER,
        abi: counterAbi,
        functionName: "payAmount",
        args: [value],
        value,
        gas: 500_000n,
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await readCounter();
    const ok = receipt.status === "success";

    return {
      ok,
      lane: "human" as Lane,
      function: fnId,
      signature: fn.signature,
      hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      caller: owner.address,
      value: value.toString(),
      valueEth: eth(value),
      amount: amountWei?.toString() ?? null,
      amountEth: amountWei == null ? null : eth(amountWei),
      before,
      after,
      explorer: `${EXPLORER}${hash}`,
      error: ok ? null : "Transaction reverted",
    };
  } catch (error) {
    return {
      ok: false,
      lane: "human" as Lane,
      function: fnId,
      signature: fn.signature,
      error: message(error),
      before,
    };
  }
}

async function agentCall(fnId: FunctionId, amountWei: bigint | null, account = ACCOUNT) {
  const fn = functionOf(fnId);
  const before = await readCounter();
  const client = account === ACCOUNT ? agentClient : createAgentClient(account);
  const [grantRaw, allowlist] = await Promise.all([readGrantRaw(account), readAllowlist(account)]);
  const grant = grantRaw.grant;

  let value = 0n;
  let spend = 0n;
  let args: Hex = "0x";

  if (fnId === "pay") {
    value = BigInt(before.agentPrice);
    spend = value;
  } else if (fnId === "payAmount") {
    value = amountWei ?? 0n;
    spend = value;
    args = encodeAbiParameters([{ type: "uint256" }], [value]);
  }

  const remaining =
    grantRaw.spent >= grantRaw.grant.budgetPerEpoch
      ? 0n
      : grantRaw.grant.budgetPerEpoch - grantRaw.spent;

  let preflight: Record<string, unknown> = { ok: true };
  if (!grant.active) {
    preflight = {
      ok: false,
      code: "E_GRANT_INACTIVE",
      message: "the owner revoked the agent grant",
    };
  } else if (!allowlist[fnId]) {
    preflight = {
      ok: false,
      code: "E_TARGET_DENIED",
      message: `${fn.signature} is not allowlisted for this account`,
    };
  } else if (spend > remaining) {
    preflight = {
      ok: false,
      code: "E_EPOCH_BUDGET",
      message: `spend ${eth(spend)} ETH exceeds the remaining ${eth(remaining)} ETH in this epoch`,
      budget: grantRaw.grant.budgetPerEpoch.toString(),
      budgetEth: eth(grantRaw.grant.budgetPerEpoch),
      spent: grantRaw.spent.toString(),
      spentEth: eth(grantRaw.spent),
      remaining: remaining.toString(),
      remainingEth: eth(remaining),
      spend: spend.toString(),
      spendEth: eth(spend),
    };
  }

  const intent = {
    target: COUNTER,
    selector: fn.selector,
    args,
    value,
    spend,
    nonce: await client.getIntentNonce(),
    deadline: grantRaw.blockTimestamp + 3600n,
    grantHash: grant.grantHash,
  };

  let simulation: ReturnType<typeof summarizeSimulation> | undefined;
  try {
    const prepared = await client.prepare(intent);
    const simulated = await client.simulateIntent(intent, { prepared });
    simulation = summarizeSimulation(simulated.result);
    const submitted = await client.submitIntent(intent, { prepared });
    const receipt = await getReceipt(submitted.hash);
    const admission = summarizeAdmission(await client
      .getAdmission(submitted.hash)
      .catch(() => null));
    const after = await readCounter();
    const included = receipt?.status === "success" || submitted.status === "OnChain" || submitted.status === "Finalized";
    const ok =
      included && receipt?.status !== "reverted" &&
      !admission?.frameStatuses?.some((status) => status === "failure" || status === "reverted");

    return {
      ok,
      lane: "agent" as Lane,
      function: fnId,
      signature: fn.signature,
      hash: submitted.hash,
      status: submitted.status,
      blockNumber: receipt?.blockNumber ?? null,
      gasUsed: receipt?.gasUsed ?? null,
      caller: account,
      frames: 2,
      value: value.toString(),
      valueEth: eth(value),
      spend: spend.toString(),
      spendEth: eth(spend),
      amount: amountWei?.toString() ?? null,
      amountEth: amountWei == null ? null : eth(amountWei),
      before,
      after,
      preflight,
      simulation,
      admission,
      explorer: `${EXPLORER}${submitted.hash}`,
      error: ok
        ? null
        : preflight.ok
          ? simulation.executionError ?? (!included && ["New", "Pending", "Submitted"].includes(submitted.status)
            ? "Accepted by the alt-mempool and awaiting inclusion."
            : `Frame transaction status: ${receipt?.status ?? submitted.status}`)
          : `${preflight.code}: ${preflight.message}`,
    };
  } catch (error) {
    let detail = message(error);
    const denial = detail.match(/validation frame (\d+): reverted with data (0x[\da-f]+)/i);
    if (denial) {
      try {
        const { args } = decodeErrorResult({
          abi: parseAbi(["error Rejected(bytes32 reason)"]),
          data: denial[2] as Hex,
        });
        detail = `Alt-mempool rejected VERIFY frame ${denial[1]}: ${hexToString(args[0]).replace(/\0+$/, "")}`;
      } catch {
        // Keep the original sidecar diagnostic for other revert types.
      }
    }
    return {
      ok: false,
      lane: "agent" as Lane,
      function: fnId,
      signature: fn.signature,
      error: detail,
      before,
      grant: serializeGrant(
        grantRaw.grant,
        grantRaw.blockTimestamp,
        grantRaw.epoch,
        grantRaw.spent,
      ),
      preflight,
      simulation,
    };
  }
}

async function writePermissions(body: Record<string, unknown>, account: Address, expectedAgentKey?: Address) {
  const [grant, block] = await Promise.all([
    publicClient.readContract({
      address: REGISTRY, abi: REGISTRY_ABI, functionName: "current", args: [account],
    }) as Promise<GrantStruct>,
    publicClient.getBlock({ blockTag: "latest" }),
  ]);
  if (grant.owner.toLowerCase() !== owner.address.toLowerCase())
    throw new Error("The agent account has no grant owned by this server on the current devnet.");
  if (expectedAgentKey && grant.agentKey.toLowerCase() !== expectedAgentKey.toLowerCase())
    throw new Error("The ENS agent key does not match this account’s devnet grant.");
  const txs: { label: string; hash: Hex }[] = [];
  const now = block.timestamp;

  const budgetProvided =
    body.budgetEth != null && String(body.budgetEth).trim() !== "";
  let budget = grant.budgetPerEpoch;
  if (budgetProvided) {
    budget = parseEther(String(body.budgetEth));
    if (budget <= 0n) throw new Error("budget must be greater than 0");
    if (budget > 2n ** 128n - 1n) throw new Error("budget exceeds uint128");
  }

  if (body.active === false) {
    const hash = await wallet.writeContract({
      address: REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "revoke",
      args: [account],
      gas: 1_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Permission transaction reverted: ${hash}`);
    txs.push({ label: "revoke grant", hash });
    return txs;
  }

  const budgetChanged = budget !== grant.budgetPerEpoch;
  const shouldGrant = budgetProvided || body.active === true || budgetChanged;

  if (shouldGrant) {
    if (grant.agentKey === zeroAddress)
      throw new Error("grant has no agent key; cannot grant");
    const expiresAt =
      grant.expiresAt > now ? grant.expiresAt : now + 7n * 86_400n;
    const epochLength = grant.epochLength > 0n ? grant.epochLength : 86_400n;
    const keyScheme = grant.keyScheme > 0 ? grant.keyScheme : 1;

    const hash = await wallet.writeContract({
      address: REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "grantAgent",
      args: [
        account,
        grant.agentKey,
        keyScheme,
        budget,
        epochLength,
        expiresAt,
      ],
      gas: 1_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Permission transaction reverted: ${hash}`);
    txs.push({
      label: `grant ${eth(budget)} ETH / ${Number(epochLength)}s`,
      hash,
    });
  }

  const allow = body.allow;
  if (allow != null && typeof allow === "object" && !Array.isArray(allow)) {
    for (const fn of FUNCTIONS) {
      const desired = (allow as Record<string, unknown>)[fn.id];
      if (desired == null) continue;
      const current = (await publicClient.readContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "isAllowed",
        args: [account, COUNTER, fn.selector],
      })) as boolean;
      if (current === Boolean(desired)) continue;

      const hash = await wallet.writeContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: desired ? "allow" : "disallow",
        args: [account, COUNTER, fn.selector],
        gas: 1_000_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Permission transaction reverted: ${hash}`);
      txs.push({
        label: `${desired ? "allow" : "disallow"} ${fn.signature}`,
        hash,
      });
    }
  }

  return txs;
}

// -------------------------------------------------------------------
// World ID Agent Pass — human approval gate for authority changes
// -------------------------------------------------------------------

async function verifyWorldIdProof(proof: unknown, req: IncomingMessage): Promise<{ valid: boolean; reason?: string }> {
  if (proof === "local-test-skip") {
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
    const origin = req.headers.origin;
    const localOrigin = !origin || /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
    return worldIdTestSkip && loopback && localOrigin
      ? { valid: true }
      : { valid: false, reason: "World ID test skip is unavailable for this request." };
  }
  if (worldIdError) return { valid: false, reason: worldIdError };
  if (!proof || typeof proof !== "object")
    return { valid: false, reason: "Complete the World ID prompt before submitting." };
  const result = proof as Record<string, unknown>;
  if (result.protocol_version !== "4.0" || "action" in result ||
      typeof result.session_id !== "string" || !result.session_id.startsWith("session_") ||
      !Array.isArray(result.responses) || !result.responses.some((response) => response?.identifier === "proof_of_human") ||
      result.environment !== "production" || typeof result.nonce !== "string")
    return { valid: false, reason: "The proof does not match Axon's World ID request." };

  const nonce = result.nonce;
  const expiresAt = worldIdNonces.get(nonce);
  if (!expiresAt || expiresAt <= Date.now() / 1000)
    return { valid: false, reason: "This World ID request expired or was already used. Verify again." };
  worldIdNonces.delete(nonce);

  try {
    const res = await fetch(`${WORLD_ID_VERIFIER_URL}/verify/${encodeURIComponent(WORLD_ID_RP_ID!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    });
    const verification = await res.json().catch(() => null);
    if (res.ok && verification?.success === true && verification.environment === "production")
      return { valid: true };
    return { valid: false, reason: verification?.detail ?? `World ID verification rejected (HTTP ${res.status})` };
  } catch (error) {
    return { valid: false, reason: `Could not reach the World ID verifier: ${(error as Error).message}` };
  }
}

/** Owner-scoped permission update for a specific agent subdomain.
 * Writes ENS text records (Sepolia) + syncs axon PermissionRegistry (devnet).
 * Requires a valid World ID Agent Pass proof before any state change.
 */
async function updatePermissionForAgent(
  body: Record<string, unknown>,
  agentName: string,
): Promise<{ ok: boolean; txs: { label: string; hash: Hex }[]; state: unknown }> {
  agentName = normalize(agentName);
  if (!HUMAN_ENS_NAME || !agentName.endsWith(`.${normalize(HUMAN_ENS_NAME)}`))
    throw new Error("Select an agent under the configured ENS parent.");

  if (!ensOwnerWallet || !ensPublicClient) {
    throw new Error("ENS Sepolia client not configured on the server");
  }
  if (!ENS_REGISTRY) throw new Error("ENS_REGISTRY must be a 20-byte contract address");
  if (!await ensPublicClient.getCode({ address: ENS_REGISTRY }))
    throw new Error("ENS_REGISTRY has no contract code on Sepolia. Configure a deployed resolver before saving permissions.");
  const ownerWallet = ensOwnerWallet;

  const txs: { label: string; hash: Hex }[] = [];

  const resolved = await resolveAgentFromEns(agentName);
  if (!resolved && (!agentStore.names(normalize(HUMAN_ENS_NAME)).includes(agentName) || body.active === false))
    throw new Error(`Agent ${agentName} has no registered Axon records.`);
  const agent = resolved ?? {
    account: ACCOUNT,
    agentKey: privateKeyToAccount(AGENT_PK).address,
    active: false,
    budget: 0n,
    version: 0n,
    allowlist: [],
  };
  if (!agent.account) throw new Error("Agent record has no devnet account.");

  const budgetProvided =
    body.budgetEth != null && String(body.budgetEth).trim() !== "";
  let budget = agent.budget;
  if (budgetProvided) {
    budget = parseEther(String(body.budgetEth));
    if (budget <= 0n) throw new Error("budget must be greater than 0");
    if (budget > 2n ** 128n - 1n) throw new Error("budget exceeds uint128");
  }

  const account = getAddress(agent.account);
  const allow = body.allow;
  const entries = new Map(agent.allowlist.map((entry) => [
    `${entry.target.toLowerCase()}:${entry.selector.toLowerCase()}`, entry,
  ]));
  const textUpdates: Array<{ key: string; value: string }> = [];
  if (!resolved) {
    if (!budgetProvided) throw new Error("Set an initial budget for this agent.");
    textUpdates.push(
      { key: "axon.dnsName", value: agentName },
      { key: "axon.agentKey", value: agent.agentKey! },
    );
  }
  if (budgetProvided && budget !== agent.budget)
    textUpdates.push({ key: "axon.budget", value: budget.toString() });
  const active = body.active === false ? false : budgetProvided || body.active === true ? true : agent.active;
  if (active !== agent.active)
    textUpdates.push({ key: "axon.active", value: String(active) });
  if (body.active !== false && allow && typeof allow === "object" && !Array.isArray(allow)) {
    for (const fn of FUNCTIONS) {
      const desired = (allow as Record<string, unknown>)[fn.id];
      if (typeof desired !== "boolean") continue;
      const id = `${COUNTER.toLowerCase()}:${fn.selector.toLowerCase()}`;
      if (desired) entries.set(id, { target: COUNTER, selector: fn.selector });
      else entries.delete(id);
    }
    if (entries.size !== agent.allowlist.length || agent.allowlist.some(
      (entry) => !entries.has(`${entry.target.toLowerCase()}:${entry.selector.toLowerCase()}`),
    )) {
      textUpdates.push({
        key: "axon.allowlist",
        value: [...entries.values()].map(({ target, selector }) => `${target}:${selector}`).join(","),
      });
    }
  }
  if (textUpdates.length) textUpdates.push({ key: "axon.version", value: (agent.version + 1n).toString() });
  if (!resolved) textUpdates.push({ key: "axon.account", value: account });

  // Check the ENS writes before changing the effective devnet grant.
  for (const { key, value } of textUpdates) {
    await ensPublicClient.simulateContract({
      account: ownerWallet.account!,
      address: ENS_REGISTRY,
      abi: ENS_TEXT_ABI,
      functionName: "setText",
      args: [agentName, key, value],
    });
  }
  txs.push(...await writePermissions(body, account, agent.agentKey ?? undefined));
  for (const { key, value } of textUpdates) {
    const hash = await ownerWallet.writeContract({
      chain: sepolia,
      account: ownerWallet.account!,
      address: ENS_REGISTRY,
      abi: ENS_TEXT_ABI,
      functionName: "setText",
      args: [agentName, key, value],
      gas: 1_000_000n,
    });
    const receipt = await ensPublicClient.waitForTransactionReceipt({ hash, timeout: 0 });
    if (receipt.status !== "success") throw new Error(`ENS update reverted for ${key}: ${hash}`);
    txs.push({ label: `ENS text ${key}=${value} for ${agentName}`, hash });
  }

  agentStore.save(normalize(HUMAN_ENS_NAME), agentName, resolved ? undefined : txs.at(-1)?.hash);

  return { ok: true, txs, state: await readState() };
}

function remember(result: Record<string, unknown>) {
  history.unshift({ ...result, at: new Date().toISOString() });
  history.splice(20);
}

function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  let path = pathname;
  if (path === "/demo" || path === "/demo/" || path === "/permissions" || path === "/permissions/") {
    res.writeHead(302, { location: path.startsWith("/permissions") ? "/app/permissions" : "/app" });
    res.end();
    return;
  }
  if (path === "/" || path === "/app" || path.startsWith("/app/") || path === "/docs" || path === "/docs/" || path === "/design-system" || path === "/design-system/") path = "/index.html";

  const file = resolve(WEB, `.${path}`);
  if (file !== WEB && !file.startsWith(`${WEB}${sep}`)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }

  readFile(file)
    .then((body) => {
      res.writeHead(200, {
        "content-type":
          MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
        "content-length": body.length,
        "x-content-type-options": "nosniff",
      });
      if (req.method === "HEAD") res.end();
      else res.end(body);
    })
    .catch((error) => {
      if ((error as { code?: string })?.code === "ENOENT") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
      } else {
        console.error("static:", error);
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("internal error");
      }
    });
}

const frontendOrigins = new Set(
  (process.env.AXON_FRONTEND_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const server = createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  if (url.pathname.startsWith("/api/")) {
    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");
    if (origin && frontendOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.writeHead(204).end();
        return;
      }
    }
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/ready") {
      json(res, 200, { ok: true, service: "axon-api" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      const [chainId, blockNumber] = await Promise.all([
        publicClient.getChainId(),
        publicClient.getBlockNumber(),
      ]);
      json(res, 200, {
        ok: chainId === CHAIN_ID,
        chainId,
        expectedChainId: CHAIN_ID,
        blockNumber: blockNumber.toString(),
        rpc: RPC,
        sidecar: SIDECAR,
        node: process.version,
        uptimeSec: Math.round(process.uptime()),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/world-id/request") {
      if (worldIdError) throw new Error(worldIdError);
      const { sig, nonce, createdAt, expiresAt } = signRequest({
        signingKeyHex: worldIdSigningKey!,
      });
      for (const [pendingNonce, expiry] of worldIdNonces) {
        if (expiry <= createdAt) worldIdNonces.delete(pendingNonce);
      }
      worldIdNonces.set(nonce, expiresAt);
      json(res, 200, {
        rp_id: WORLD_ID_RP_ID,
        nonce,
        created_at: createdAt,
        expires_at: expiresAt,
        signature: sig,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      json(res, 200, await readState());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/call") {
      const body = await readBody(req);
      const lane = String(body.lane ?? "") as Lane;
      const fnId = String(body.function ?? "") as FunctionId;
      const agentName = String(body.agentName ?? "");
      if (lane !== "human" && lane !== "agent")
        throw new Error("lane must be human or agent");
      const fn = functionOf(fnId);
      const amountWei =
        fnId === "payAmount" ? parseAmount(body.amountEth) : null;

      let agentContext: { name: string; account: Address; permissions: unknown } | null = null;
      if (lane === "agent" && agentName) {
        const resolved = await resolveAgentFromEns(agentName);
        if (!resolved?.account || !isAddress(resolved.account, { strict: false }))
          throw new Error(`Agent ${agentName} has no valid devnet account in its Sepolia records.`);
        agentContext = {
          name: resolved.name,
          account: getAddress(resolved.account),
          permissions: {
            active: resolved.active,
            budget: resolved.budget.toString(),
            version: resolved.version.toString(),
            allowlist: resolved.allowlist,
          },
        };
      }

      const result =
        lane === "human"
          ? await humanCall(fnId, amountWei)
          : await agentCall(fnId, amountWei, agentContext?.account);
      const recorded = { ...result, agent: agentContext };
      remember(recorded);
      json(res, 200, {
        ok: Boolean(result.ok),
        result: recorded,
        state: await readState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/permission") {
      const body = await readBody(req);
      const verification = await verifyWorldIdProof(body.worldIdProof, req);
      if (!verification.valid) {
        throw new Error(`World ID verification required: ${verification.reason ?? "invalid proof"}`);
      }
      const agentName = String(body.agentName ?? "");
      let result;
      if (agentName) {
        result = await updatePermissionForAgent(body, agentName);
      } else {
        result = { ok: true, txs: await writePermissions(body, ACCOUNT), state: await readState() };
      }
      json(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ens/resolve") {
      const name = url.searchParams.get("name");
      if (!name) throw new Error("name query parameter is required");
      const resolved = await resolveAgentFromEns(name);
      if (!resolved) {
        json(res, 404, { ok: false, error: `ENS name ${name} not resolvable or has no axon records` });
        return;
      }
      json(res, 200, {
        ok: true,
        name: resolved.name,
        account: resolved.account,
        agentKey: resolved.agentKey,
        active: resolved.active,
        budget: resolved.budget.toString(),
        version: resolved.version.toString(),
        allowlist: resolved.allowlist,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ens/agents") {
      const name = url.searchParams.get("name") ?? HUMAN_ENS_NAME;
      if (!name) throw new Error("name query parameter is required (or set HUMAN_ENS_NAME)");
      const subs = agentStore.names(normalize(name));
      const resolved = await Promise.all(
        subs.map(async (sub) => {
          const agent = await resolveAgentFromEns(sub);
          return {
            name: sub,
            ...(agent
              ? {
                  account: agent.account,
                  agentKey: agent.agentKey,
                  active: agent.active,
                  budget: agent.budget.toString(),
                  version: agent.version.toString(),
                  allowlist: agent.allowlist,
                }
              : { unresolved: true }),
          };
        }),
      );
      json(res, 200, { ok: true, parent: name, agents: resolved });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ens/register") {
      const body = await readBody(req);
      const { subdomain, budgetEth } = body as {
        subdomain?: string;
        budgetEth?: string;
      };
      if (!subdomain || !budgetEth)
        throw new Error("subdomain and budgetEth are required");
      if (!ensOwnerWallet || !ensPublicClient)
        throw new Error("ENS Sepolia client not configured");

      // Default agent account and key from deployment config.
      const agentAccount = ACCOUNT;
      const agentKey = privateKeyToAccount(AGENT_PK).address;

      if (!ENS_REGISTRY) throw new Error("ENS_REGISTRY must be a 20-byte contract address");
      if (!await ensPublicClient.getCode({ address: ENS_REGISTRY }))
        throw new Error("ENS_REGISTRY has no contract code on Sepolia. Configure a deployed resolver before registering agents.");
      const ownerWallet = ensOwnerWallet;

      // World ID gate for creating a new agent namespace.
      const proof = body.worldIdProof;
      const verification = await verifyWorldIdProof(proof, req);
      if (!verification.valid) {
        throw new Error(`World ID verification required: ${verification.reason ?? "invalid proof"}`);
      }

      const parent = HUMAN_ENS_NAME ?? subdomain.split(".").slice(-2).join(".");
      const fullName = normalize(`${subdomain}.${parent}`);
      const budget = parseEther(String(budgetEth));
      if (budget <= 0n) throw new Error("budget must be greater than 0");

      const textRecords = [
        { key: "axon.dnsName", value: fullName },
        { key: "axon.account", value: agentAccount },
        { key: "axon.agentKey", value: agentKey },
        { key: "axon.active", value: "true" },
        { key: "axon.budget", value: budget.toString() },
        { key: "axon.version", value: "1" },
        { key: "axon.allowlist", value: "" },
      ];

      if (activeEnsRegistrations.has(fullName))
        throw new Error(`Registration for ${fullName} is already running.`);
      activeEnsRegistrations.add(fullName);
      const txs: { label: string; hash: Hex }[] = [];
      try {
        for (const { key, value } of textRecords) {
          const recordId = `${fullName}:${key}`;
          let pending = pendingEnsRegistrationWrites.get(recordId);
          if (!pending) {
            if (await readEnsTextRecord(fullName, key) === value) continue;
            const { request } = await ensPublicClient.simulateContract({
              account: ownerWallet.account!,
              address: ENS_REGISTRY,
              abi: ENS_TEXT_ABI,
              functionName: "setText",
              args: [fullName, key, value],
            }).catch((error) => {
              throw new Error(`ENS simulation failed for ${key}: ${message(error)}`);
            });
            const hash = await ownerWallet.writeContract({
              ...request,
              chain: sepolia,
              gas: 1_000_000n,
            });
            pending = { hash, value };
            pendingEnsRegistrationWrites.set(recordId, pending);
          }
          const { hash } = pending;
          const receipt = await ensPublicClient.waitForTransactionReceipt({
            hash,
            timeout: 0, // Keep polling while the Sepolia transaction is pending.
          }).catch((error) => {
            throw new Error(`Could not confirm ENS text update for ${key} (${hash}): ${message(error)}`);
          });
          pendingEnsRegistrationWrites.delete(recordId);
          if (receipt.status !== "success") throw new Error(`ENS text update failed for ${key}: ${hash}`);
          if (pending.value !== value)
            throw new Error(`An earlier write for ${key} has now confirmed. Retry to apply the new value.`);
          txs.push({ label: `ENS text ${key} for ${fullName}`, hash });
        }
      } finally {
        activeEnsRegistrations.delete(fullName);
      }

      agentStore.save(normalize(parent), fullName, txs.at(-1)?.hash);

      json(res, 200, {
        ok: true,
        agent: fullName,
        txs,
      });
      return;
    }

    if (!API_ONLY && !url.pathname.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD")) {
      serveStatic(req, res, url.pathname);
      return;
    }

    json(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    json(res, 400, { ok: false, error: message(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FinalCounter demo  http://localhost:${PORT}`);
  console.log(`  counter          ${COUNTER}`);
  console.log(`  agent account    ${ACCOUNT}`);
  console.log(`  registry         ${REGISTRY}`);
  if (!API_ONLY) console.log(`  console          http://localhost:${PORT}/app`);
  console.log(`  rpc host         ${new URL(RPC).hostname}`);
});

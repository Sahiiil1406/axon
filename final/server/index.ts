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
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatEther,
  http,
  parseEther,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AxonClient } from "../sdk/src/index.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");
const WEB = resolve(HERE, "web");
process.loadEnvFile(resolve(ROOT, ".env"));

const deployment = JSON.parse(
  readFileSync(resolve(HERE, "deployments.json"), "utf8"),
) as {
  chainId: number;
  rpc: string;
  sidecar: string;
  registry: Address;
  agentAccount: Address;
  counter: Address;
  owner: Address;
  agentKey: Address;
};

const artifact = JSON.parse(
  readFileSync(resolve(HERE, "out/FinalCounter.sol/FinalCounter.json"), "utf8"),
) as { abi: Abi };
const counterAbi = artifact.abi;

const RPC = process.env.RPC ?? deployment.rpc;
const SIDECAR = process.env.SIDECAR ?? deployment.sidecar;
const CHAIN_ID = Number(deployment.chainId ?? 1337);
const PORT = Number(process.env.FINAL_PORT ?? 8900);
const HOST = process.env.FINAL_HOST ?? "127.0.0.1";
const EXPLORER = "https://altmempoolexplorer.forshtat.com/tx/";

const OWNER_PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const AGENT_PK = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
if (!OWNER_PK) throw new Error("DEPLOYER_PRIVATE_KEY is required");
if (!AGENT_PK) throw new Error("AGENT_PRIVATE_KEY is required");

const COUNTER = deployment.counter;
const REGISTRY = deployment.registry;
const ACCOUNT = deployment.agentAccount;

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

const agentClient = new AxonClient({
  account: ACCOUNT,
  registry: REGISTRY,
  vault: COUNTER,
  oracle: COUNTER,
  agentPrivateKey: AGENT_PK,
  chainId: CHAIN_ID,
  rpc: RPC,
  sidecar: SIDECAR,
});

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

async function readGrantRaw() {
  const [grant, block] = await Promise.all([
    publicClient.readContract({
      address: REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "current",
      args: [ACCOUNT],
    }) as Promise<GrantStruct>,
    publicClient.getBlock({ blockTag: "latest" }),
  ]);

  const epoch =
    grant.epochLength > 0n ? block.timestamp / grant.epochLength : 0n;
  const spent = (await publicClient.readContract({
    address: ACCOUNT,
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

async function readAllowlist() {
  const entries = await Promise.all(
    FUNCTIONS.map(async (fn) => {
      const allowed = (await publicClient.readContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "isAllowed",
        args: [ACCOUNT, COUNTER, fn.selector],
      })) as boolean;
      return [fn.id, allowed] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<FunctionId, boolean>;
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
      agentKey: deployment.agentKey,
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

async function agentCall(fnId: FunctionId, amountWei: bigint | null) {
  const fn = functionOf(fnId);
  const before = await readCounter();
  const grantRaw = await readGrantRaw();
  const grant = await agentClient.getGrant();
  const allowlist = await readAllowlist();

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
    nonce: await agentClient.getIntentNonce(),
    deadline: grantRaw.blockTimestamp + 3600n,
    grantHash: grant.grantHash,
  };

  try {
    const prepared = await agentClient.prepare(intent);
    const simulated = await agentClient.simulateIntent(intent, { prepared });
    const simulation = summarizeSimulation(simulated.result);
    const submitted = await agentClient.submitIntent(intent, { prepared });
    const receipt = await getReceipt(submitted.hash);
    const admission = await agentClient
      .getAdmission(submitted.hash)
      .catch(() => null);
    const after = await readCounter();
    const ok =
      submitted.status === "OnChain" || submitted.status === "Finalized";

    return {
      ok,
      lane: "agent" as Lane,
      function: fnId,
      signature: fn.signature,
      hash: submitted.hash,
      status: submitted.status,
      blockNumber: receipt?.blockNumber ?? null,
      gasUsed: receipt?.gasUsed ?? null,
      caller: ACCOUNT,
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
      admission: summarizeAdmission(admission),
      explorer: `${EXPLORER}${submitted.hash}`,
      error: ok
        ? null
        : preflight.ok
          ? "Frame transaction reverted"
          : `${preflight.code}: ${preflight.message}`,
    };
  } catch (error) {
    return {
      ok: false,
      lane: "agent" as Lane,
      function: fnId,
      signature: fn.signature,
      error: message(error),
      before,
      grant: serializeGrant(
        grantRaw.grant,
        grantRaw.blockTimestamp,
        grantRaw.epoch,
        grantRaw.spent,
      ),
      preflight,
    };
  }
}

async function updatePermission(body: Record<string, unknown>) {
  const { grant, blockTimestamp } = await readGrantRaw();
  const txs: { label: string; hash: Hex }[] = [];
  const now = blockTimestamp;

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
      args: [ACCOUNT],
      gas: 1_000_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    txs.push({ label: "revoke grant", hash });
    return { ok: true, txs, state: await readState() };
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
        ACCOUNT,
        grant.agentKey,
        keyScheme,
        budget,
        epochLength,
        expiresAt,
      ],
      gas: 1_000_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash });
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
        args: [ACCOUNT, COUNTER, fn.selector],
      })) as boolean;
      if (current === Boolean(desired)) continue;

      const hash = await wallet.writeContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: desired ? "allow" : "disallow",
        args: [ACCOUNT, COUNTER, fn.selector],
        gas: 1_000_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      txs.push({
        label: `${desired ? "allow" : "disallow"} ${fn.signature}`,
        hash,
      });
    }
  }

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
  if (path === "/" || path === "/demo" || path === "/demo/")
    path = "/index.html";
  if (path === "/permissions" || path === "/permissions/")
    path = "/permissions.html";

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

const server = createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  try {
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

    if (req.method === "GET" && url.pathname === "/api/state") {
      json(res, 200, await readState());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/call") {
      const body = await readBody(req);
      const lane = String(body.lane ?? "") as Lane;
      const fnId = String(body.function ?? "") as FunctionId;
      if (lane !== "human" && lane !== "agent")
        throw new Error("lane must be human or agent");
      const fn = functionOf(fnId);
      const amountWei =
        fnId === "payAmount" ? parseAmount(body.amountEth) : null;

      const result =
        lane === "human"
          ? await humanCall(fnId, amountWei)
          : await agentCall(fnId, amountWei);
      remember(result as Record<string, unknown>);
      json(res, 200, {
        ok: Boolean(result.ok),
        result,
        state: await readState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/permission") {
      const body = await readBody(req);
      const result = await updatePermission(body);
      json(res, 200, result);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
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
  console.log(`  permissions      http://localhost:${PORT}/permissions`);
  console.log(`  rpc              ${RPC}`);
});

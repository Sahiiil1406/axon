/**
 * Run the Axon agent loop against the devnet.
 *
 *   npx tsx scripts/run.ts                                # plan + simulate a rebalance
 *   npx tsx scripts/run.ts --amount 0.02                  # explicit size
 *   npx tsx scripts/run.ts --amount 0.02 --submit         # send to the alt mempool
 *   npx tsx scripts/run.ts --amount 0.6 --self-correct    # shrink to the budget and retry
 *   npx tsx scripts/run.ts --action AgentVault.withdraw --to 0x… --amount 0.01
 *   npx tsx scripts/run.ts --emit ../final/data/runs.json --append
 *
 * The default is dry-run: it builds and signs an intent, simulates it, and
 * explains what would happen. Nothing is sent unless `--submit` is passed.
 *
 * `--llm` asks an OpenAI-compatible model to choose the action; it still goes
 * through the same planner and simulator. `--refresh-oracle` is demo setup the
 * *owner* performs, not something the agent is allowed to do.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AxonClient } from "../../sdk/src/client.ts";
import { loadManifest } from "../../sdk/src/manifest.ts";
import { AgentLoop, toJson, type LoopRequest, type LoopResult } from "../src/loop.ts";
import { formatEth } from "../src/planner.ts";
import { chooseAction, llmFromEnv } from "../src/llm.ts";
import { loadEnv, requireEnv } from "../src/env.ts";

const ROOT = resolve(import.meta.dirname, "../..");
loadEnv(ROOT);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next != null && !next.startsWith("--") ? next : fallback;
};

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

interface Deployments {
  chainId: number;
  network?: string;
  rpc?: string;
  sidecar?: string;
  contracts: Record<string, Address>;
  accounts: { AgentAccount: Address; owner: Address; agent: Address };
  stakingRegistry?: Address;
}

const deploymentsPath = resolve(ROOT, value("--deployments", "deployments.json")!);
if (!existsSync(deploymentsPath)) fail(`missing ${deploymentsPath}`);
const deployments = JSON.parse(readFileSync(deploymentsPath, "utf8")) as Deployments;

const manifestPath = resolve(ROOT, value("--manifest", "codegen/manifest.json")!);
if (!existsSync(manifestPath)) fail(`missing ${manifestPath} — run \`npm run generate\` in codegen/`);
const manifest = loadManifest(manifestPath);

const RPC = value("--rpc", process.env.RPC ?? deployments.rpc ?? "https://altmempool.forshtat.com")!;
const SIDECAR = value("--sidecar", process.env.SIDECAR ?? deployments.sidecar ?? `${RPC}/rpc`)!;

const agentKey = requireEnv("AGENT_PRIVATE_KEY") as Hex;
const agent = privateKeyToAccount(agentKey);

const client = new AxonClient({
  account: deployments.accounts.AgentAccount,
  registry: deployments.contracts.PermissionRegistry,
  vault: deployments.contracts.AgentVault,
  oracle: deployments.contracts.MockOracle,
  agentPrivateKey: agentKey,
  chainId: deployments.chainId,
  rpc: RPC,
  sidecar: SIDECAR,
  stakingRegistry: deployments.stakingRegistry,
});

const loop = new AgentLoop(manifest, client, deployments.accounts.AgentAccount, agent.address);

async function refreshOracle(): Promise<void> {
  const pk = requireEnv("DEPLOYER_PRIVATE_KEY") as Hex;
  const owner = privateKeyToAccount(pk);
  const chain = {
    id: deployments.chainId,
    name: "eip8141-devnet",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  } as const;
  const wallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const hash = await wallet.writeContract({
    address: deployments.contracts.MockOracle,
    abi: [
      { type: "function", name: "setPrice", stateMutability: "nonpayable", inputs: [{ name: "price_", type: "uint256" }], outputs: [] },
    ] as const,
    functionName: "setPrice",
    args: [10n ** 18n],
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  if (!flag("--quiet")) console.log(`oracle refreshed by owner: ${hash}`);
}

function parseAmount(name: string): bigint | undefined {
  const raw = value(name);
  if (raw === undefined) return undefined;
  try {
    return parseEther(raw);
  } catch {
    fail(`${name} must be a decimal ETH amount, got "${raw}"`);
  }
}

function requestFromArgs(): LoopRequest {
  return {
    action: value("--action", "AgentVault.rebalance")!,
    amount: parseAmount("--amount"),
    minOut: parseAmount("--min-out"),
    to: value("--to") as Address | undefined,
    spend: parseAmount("--spend"),
    slippageBps: value("--slippage-bps") ? BigInt(value("--slippage-bps")!) : undefined,
    deadlineSeconds: value("--deadline") ? Number(value("--deadline")) : undefined,
    selfCorrect: flag("--self-correct") || flag("--cap"),
  };
}

function printResult(result: LoopResult): void {
  console.log("");
  console.log(`Axon run — ${result.plan?.action ?? result.request.action}`);
  console.log(`  account  ${result.account}`);
  console.log(`  agent    ${result.agent}`);
  console.log(
    `  state    grant v${result.state.grantVersion} active=${result.state.grantActive} ` +
      `remaining=${formatEth(BigInt(result.state.remainingBudget))} ETH deposits=${formatEth(BigInt(result.state.deposits))} ` +
      `oracleAge=${result.state.oracleAge}s`,
  );

  if (result.plan != null) {
    for (const check of result.plan.checks) {
      const mark = check.status === "ok" ? "ok  " : check.status === "warn" ? "warn" : "FAIL";
      console.log(`  ${mark} ${check.id.padEnd(18)} ${check.detail}`);
    }
    for (const note of result.plan.notes) console.log(`  note ${note}`);
  }

  if (result.simulation != null) {
    console.log(
      `  sim      execution=${result.simulation.executionStatus} gas=${result.simulation.gasUsed} ` +
        `publicMempoolValid=${result.simulation.canonicalMempoolValid}`,
    );
    if (result.simulation.canonicalMempoolViolation != null) {
      console.log(`           public-pool rule: ${result.simulation.canonicalMempoolViolation}`);
    }
  }
  if (result.submission != null) {
    console.log(`  tx       ${result.submission.hash} → ${result.submission.status}`);
  }
  console.log(`  outcome  ${result.outcome}`);
  if (result.explanation != null) console.log(`  explain  ${result.explanation}`);
  console.log("");
}

function appendRun(path: string, result: LoopResult): void {
  let body: { version: number; network?: string; runs: LoopResult[] };
  if (existsSync(path)) {
    body = JSON.parse(readFileSync(path, "utf8")) as typeof body;
    body.runs ??= [];
  } else {
    body = { version: 1, network: deployments.network, runs: [] };
  }
  body.runs.push(result);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(body, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`,
  );
  if (!flag("--quiet")) console.log(`appended run to ${path}`);
}

async function main(): Promise<void> {
  if (flag("--refresh-oracle")) await refreshOracle();

  const request = requestFromArgs();

  if (flag("--llm")) {
    const config = llmFromEnv();
    if (config == null) fail("--llm requires AXON_LLM_API_KEY");
    const grant = await client.getGrant();
    const vault = await client.getVaultState();
    const remaining = await client.remainingBudget();
    const summary = [
      `account ${deployments.accounts.AgentAccount}`,
      `grant v${grant.version} active=${grant.active} budgetPerEpoch=${formatEth(grant.budgetPerEpoch)} ETH remaining=${formatEth(remaining)} ETH`,
      `deposits=${formatEth(vault.deposits)} ETH maxTrade=${formatEth(vault.maxTrade)} cooldown=${vault.cooldown}s oracleAge=${vault.blockTimestamp - vault.oracleUpdatedAt}s`,
    ].join("\n");
    const choice = await chooseAction(
      config,
      manifest,
      summary,
      value("--goal", "Rebalance a small amount within the grant.")!,
    );
    request.action = choice.action;
    if (choice.arguments.amount != null) request.amount = BigInt(String(choice.arguments.amount));
    if (choice.arguments.minOut != null) request.minOut = BigInt(String(choice.arguments.minOut));
    if (choice.arguments.to != null) request.to = String(choice.arguments.to) as Address;
    if (choice.spend != null) request.spend = BigInt(choice.spend);
    if (choice.deadlineSeconds != null) request.deadlineSeconds = choice.deadlineSeconds;
    if (!flag("--quiet")) console.log(`llm chose ${request.action}`);
  }

  const result = await loop.run(request, {
    submit: flag("--submit"),
    timeoutMs: value("--timeout") ? Number(value("--timeout")) : undefined,
  });

  const emit = value("--emit");
  if (emit != null) {
    const path = resolve(process.cwd(), emit);
    if (flag("--append")) appendRun(path, result);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${toJson(result)}\n`);
      if (!flag("--quiet")) console.log(`wrote ${path}`);
    }
  }

  if (flag("--json")) console.log(toJson(result));
  else if (!flag("--quiet")) printResult(result);

  process.exit(result.outcome === "simulated" || result.outcome === "submitted" ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(2);
});

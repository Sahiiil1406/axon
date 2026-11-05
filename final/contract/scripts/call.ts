/**
 * Call the same FinalCounter endpoint from two lanes.
 *
 *   npx tsx scripts/call.ts state
 *   npx tsx scripts/call.ts both                 # human increment + agent 2-frame increment
 *   npx tsx scripts/call.ts increment --lane human
 *   npx tsx scripts/call.ts increment --lane agent
 *   npx tsx scripts/call.ts pay --lane both      # human pays 0.001 ETH, agent pays 0.0001 ETH
 *
 * `--lane agent` is a real EIP-8141 frame transaction:
 *
 *   [0] VERIFY  AgentAccount.validate() -> FinalCounter.validateAgentAction()
 *   [1] SENDER  AgentAccount.execute()  -> FinalCounter.increment()/pay()
 *
 * `--lane human` is an ordinary EOA transaction to the same selector.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AxonClient } from "../../sdk/src/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
process.loadEnvFile(resolve(ROOT, ".env"));

const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const SIDECAR = process.env.SIDECAR ?? "https://altmempool.forshtat.com/rpc";
const PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY is required");

const deploymentPath = resolve(ROOT, "final/deployments.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as {
  counter: Address;
  agentAccount: Address;
  registry: Address;
  agentKey: Address;
  agent: { price: string; step: number };
  human: { price: string; step: number };
};

const artifact = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../out/FinalCounter.sol/FinalCounter.json"), "utf8"),
) as { abi: Abi };
const abi = artifact.abi;

const chain = {
  id: 1337,
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const human = privateKeyToAccount(PK);
const wallet = createWalletClient({ account: human, chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });

const EXPLORER = "https://altmempoolexplorer.forshtat.com/tx/";

type Action = "increment" | "pay";
type LaneArg = "human" | "agent" | "both";

const action = (process.argv[2] ?? "both").toLowerCase();
const laneArg = ((process.argv[3] === "--lane" ? process.argv[4] : process.argv[3]) ?? "both").toLowerCase() as LaneArg;

async function state(label = "state"): Promise<void> {
  const s = (await publicClient.readContract({
    address: deployment.counter,
    abi,
    functionName: "snapshot",
  })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, Address];

  console.log(
    `${label.padEnd(14)} humanCount=${s[0]} agentCount=${s[1]} ` +
      `humanPaid=${s[2]} agentPaid=${s[3]} ` +
      `humanPayments=${s[4]} agentPayments=${s[5]} ` +
      `lastLane=${s[6] === 1 ? "AGENT" : "HUMAN"} lastCaller=${s[7]}`,
  );
}

async function humanCall(kind: Action): Promise<void> {
  const price = BigInt(deployment.human.price);
  const hash =
    kind === "increment"
      ? await wallet.writeContract({
          address: deployment.counter,
          abi,
          functionName: "increment",
          args: [],
          gas: 300_000n,
        })
      : await wallet.writeContract({
          address: deployment.counter,
          abi,
          functionName: "pay",
          args: [],
          value: price,
          gas: 300_000n,
        });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`human ${kind} failed: ${hash}`);
  console.log(`human ${kind.padEnd(9)} ${hash}  ${EXPLORER}${hash}`);
}

async function agentCall(kind: Action): Promise<void> {
  const client = new AxonClient({
    account: deployment.agentAccount,
    registry: deployment.registry,
    // Only the agent transaction path is used; these two are required by the
    // client config but are never read by `submitIntent`.
    vault: deployment.counter,
    oracle: deployment.counter,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY as Hex,
    chainId: 1337,
    rpc: RPC,
    sidecar: SIDECAR,
  });

  const grant = await client.getGrant();
  if (!grant.active) throw new Error("agent grant is not active");

  const value = kind === "pay" ? BigInt(deployment.agent.price) : 0n;
  const intent = {
    target: deployment.counter,
    selector: toFunctionSelector(kind === "pay" ? "pay()" : "increment()"),
    args: "0x" as Hex,
    value,
    spend: value,
    nonce: await client.getIntentNonce(),
    deadline: (await client.getBlockTimestamp()) + 3600n,
    grantHash: grant.grantHash,
  };

  const result = await client.submitIntent(intent);
  console.log(
    `agent ${kind.padEnd(9)} ${result.hash}  status=${result.status}  ${EXPLORER}${result.hash}`,
  );
}

function selectedLanes(): Exclude<LaneArg, "both">[] {
  if (laneArg === "human" || laneArg === "agent") return [laneArg];
  return ["human", "agent"];
}

async function main(): Promise<void> {
  console.log("counter        ", deployment.counter);
  console.log("agent account  ", deployment.agentAccount);
  console.log("human          ", human.address);
  console.log("agent key      ", deployment.agentKey);

  if (action === "state") {
    await state();
    return;
  }

  const kind: Action = action === "pay" ? "pay" : "increment";
  const lanes = selectedLanes();

  await state("before");
  for (const lane of lanes) {
    if (lane === "human") await humanCall(kind);
    else await agentCall(kind);
    await state(`after ${lane}`);
  }
}

await main();

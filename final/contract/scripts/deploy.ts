/**
 * Deploy FinalCounter to the alt-mempool devnet and wire the agent allowlist.
 *
 *   cd final/contract && npm run deploy
 *
 * The devnet's `eth_estimateGas` does not include EIP-8037 state gas for code
 * deposit, so every deployment uses a fixed, generous limit (same workaround as
 * `sdk/scripts/deploy.ts`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "../..");
process.loadEnvFile(resolve(ROOT, ".env"));

const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const REGISTRY = process.env.REGISTRY_ADDRESS as Address | undefined;
const ACCOUNT = process.env.ACCOUNT_ADDRESS as Address | undefined;

if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY is required");
if (!REGISTRY) throw new Error("REGISTRY_ADDRESS is required");
if (!ACCOUNT) throw new Error("ACCOUNT_ADDRESS is required");

const chain = {
  id: Number(process.env.CHAIN_ID ?? 1337),
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const deployer = privateKeyToAccount(PK);
const wallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });

const GAS = 20_000_000n;
const TOPUP = parseEther("1");

function artifact(): { abi: Abi; bytecode: Hex } {
  const path = resolve(import.meta.dirname, "../out/FinalCounter.sol/FinalCounter.json");
  const json = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

const REGISTRY_ABI = [
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
] as const satisfies Abi;

const { abi, bytecode } = artifact();
if (await publicClient.getChainId() !== chain.id) throw new Error("RPC chain ID mismatch");
const initialGrant = await publicClient.readContract({address: REGISTRY, abi: REGISTRY_ABI, functionName: "current", args: [ACCOUNT]});
if (initialGrant.owner.toLowerCase() !== deployer.address.toLowerCase()) throw new Error("Deployer does not own the agent grant");

console.log("deployer ", deployer.address);
console.log("registry ", REGISTRY);
console.log("account  ", ACCOUNT);
console.log("nonce    ", await publicClient.getTransactionCount({ address: deployer.address }));

const deployHash = await wallet.deployContract({
  abi,
  bytecode: bytecode,
  args: [REGISTRY],
  gas: GAS,
});
console.log("deploy tx", deployHash);

const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
if (receipt.status !== "success" || receipt.contractAddress == null) {
  throw new Error(
    `FinalCounter deploy failed: ${deployHash} (status ${receipt.status}, gasUsed ${receipt.gasUsed})`,
  );
}
const counter = receipt.contractAddress;
console.log("counter  ", counter, `(${receipt.gasUsed} gas)`);

// Make the three endpoints callable by the agent account. Each `allow` bumps the
// grant hash, so read the hash again before the agent builds an intent.
for (const signature of ["increment()", "pay()", "payAmount(uint256)"]) {
  const selector = toFunctionSelector(signature);
  const already = (await publicClient.readContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "isAllowed",
    args: [ACCOUNT, counter, selector],
  })) as boolean;

  if (already) {
    console.log("allow    ", signature, selector, "already allowed");
    continue;
  }

  const hash = await wallet.writeContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "allow",
    args: [ACCOUNT, counter, selector],
    gas: 1_000_000n,
  });
  const allowReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (allowReceipt.status !== "success") {
    throw new Error(`registry.allow(${signature}) failed: ${hash}`);
  }
  console.log("allow    ", signature, selector, hash);
}

// Give the account a little ETH so `pay()` can forward AGENT_PRICE.
const balance = await publicClient.getBalance({ address: ACCOUNT });
if (balance < TOPUP) {
  const hash = await wallet.sendTransaction({
    to: ACCOUNT,
    value: TOPUP - balance,
    gas: 100_000n,
  });
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (fundReceipt.status !== "success") throw new Error(`fund account failed: ${hash}`);
  console.log("fund     ", ACCOUNT, `+${(TOPUP - balance).toString()} wei`, hash);
} else {
  console.log("fund     ", ACCOUNT, `already ${balance.toString()} wei`);
}

const grant = (await publicClient.readContract({
  address: REGISTRY,
  abi: REGISTRY_ABI,
  functionName: "current",
  args: [ACCOUNT],
})) as {
  owner: Address;
  agentKey: Address;
  budgetPerEpoch: bigint;
  active: boolean;
  grantHash: Hex;
};

const humanPrice = (await publicClient.readContract({
  address: counter,
  abi,
  functionName: "HUMAN_PRICE",
})) as bigint;
const agentPrice = (await publicClient.readContract({
  address: counter,
  abi,
  functionName: "AGENT_PRICE",
})) as bigint;

const record = {
  chainId: chain.id,
  network: "eip8141-altmempool-devnet",
  rpc: RPC,
  sidecar: process.env.SIDECAR ?? "https://altmempool.forshtat.com/rpc",
  registry: REGISTRY,
  agentAccount: ACCOUNT,
  counter,
  owner: deployer.address,
  agentKey: grant.agentKey,
  grantHash: grant.grantHash,
  grantActive: grant.active,
  budgetPerEpoch: grant.budgetPerEpoch.toString(),
  human: { step: 1, price: humanPrice.toString() },
  agent: { step: 10, price: agentPrice.toString() },
  deployTx: deployHash,
  deployedAt: new Date().toISOString(),
};

writeFileSync(resolve(ROOT, "deployment.json"), `${JSON.stringify(record, null, 2)}\n`);
console.log("wrote    ", resolve(ROOT, "deployment.json"));

for (const envPath of [resolve(ROOT, ".env"), resolve(ROOT, "server/.env"), resolve(ROOT, "../.env")]) {
if (!existsSync(envPath)) continue;
let env = readFileSync(envPath, "utf8");
env = env.match(/^FINAL_COUNTER_ADDRESS=.*$/m)
  ? env.replace(/^FINAL_COUNTER_ADDRESS=.*$/m, `FINAL_COUNTER_ADDRESS=${counter}`)
  : `${env.replace(/\s*$/, "")}\nFINAL_COUNTER_ADDRESS=${counter}\n`;
writeFileSync(envPath, env);
console.log("wrote    ", envPath, "FINAL_COUNTER_ADDRESS");
}

console.log("\nnext:");
console.log("  npx tsx scripts/call.ts both");
console.log("  npx tsx scripts/call.ts call --lane agent");

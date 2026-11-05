/**
 * Deploy the Axon demo stack with explicit gas limits.
 *
 * `forge script` sizes its transactions from `eth_estimateGas`, which on the
 * Amsterdam devnet does not include EIP-8037 *state* gas (code deposit). Every
 * deploy then runs out of gas. Deploying from here with a fixed, generous limit
 * avoids that, and keeps deployment next to the rest of the SDK tooling.
 *
 *   npx tsx scripts/deploy.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, createPublicClient, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "contracts/out");
const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY is required");

const chain = { id: 1337, name: "eip8141-devnet", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object as Hex };
}

// EIP-8037 code deposit is ~1,470 gas per runtime byte on this devnet, so a
// 6.5 KB account needs ~10M gas. `eth_estimateGas` misses it entirely.
const GAS = 20_000_000n;

async function deploy(name: string, args: unknown[] = []): Promise<Hex> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode, args, gas: GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`${name} deploy failed: ${hash} (status ${receipt.status}, gasUsed ${receipt.gasUsed})`);
  }
  console.log(`${name.padEnd(20)} ${receipt.contractAddress}  (${hash})`);
  return receipt.contractAddress;
}

console.log("owner", account.address);
console.log("nonce", await publicClient.getTransactionCount({ address: account.address }));

const accountOnly = process.argv.includes("--account-only");

let registry = process.env.REGISTRY_ADDRESS as Hex | undefined;
let oracle = process.env.ORACLE_ADDRESS as Hex | undefined;
let vault = process.env.VAULT_ADDRESS as Hex | undefined;

if (accountOnly) {
  if (!registry || !oracle || !vault) throw new Error("--account-only needs REGISTRY_ADDRESS/ORACLE_ADDRESS/VAULT_ADDRESS");
  console.log("reusing registry", registry);
  console.log("reusing oracle  ", oracle);
  console.log("reusing vault   ", vault);
} else {
  registry = await deploy("PermissionRegistry");
  oracle = await deploy("MockOracle", [10n ** 18n]);
  vault = await deploy("AgentVault", [registry, oracle]);
}

const agentAccount = await deploy("AgentAccount", [account.address, registry]);

const envPath = resolve(ROOT, ".env");
let env = readFileSync(envPath, "utf8");
const set = (key: string, value: string) => {
  env = env.match(new RegExp(`^${key}=.*$`, "m"))
    ? env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : `${env}\n${key}=${value}`;
};
set("REGISTRY_ADDRESS", registry!);
set("ORACLE_ADDRESS", oracle!);
set("VAULT_ADDRESS", vault!);
set("ACCOUNT_ADDRESS", agentAccount);
writeFileSync(envPath, env);
console.log("wrote addresses to .env");

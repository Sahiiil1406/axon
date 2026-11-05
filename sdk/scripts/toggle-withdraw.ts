/**
 * Beat 4 setup — temporarily let the agent reach AgentVault.withdraw.
 *
 * The main grant only allowlists `rebalance`, so the agent's planner rejects a
 * withdraw before it ever reaches the protocol. To show the *protocol's* rule
 * (withdraw may only pay the owner), the owner has to allow the selector first.
 * This script flips it on and off so the demo can be repeated.
 *
 *   npx tsx scripts/toggle-withdraw.ts --allow
 *   npx tsx scripts/toggle-withdraw.ts --disallow
 *
 * Both commands bump the grant version, which changes `grantHash`. Any
 * pre-signed intent becomes stale, which is the intended behaviour.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "../..");
const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";
const REGISTRY = process.env.REGISTRY_ADDRESS as Address;
const VAULT = process.env.VAULT_ADDRESS as Address;
const ACCOUNT = process.env.ACCOUNT_ADDRESS as Address;
const PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY is required");

const withdrawSelector = "0xf3fef3a3" as const;
const allow = process.argv.includes("--allow");

const chain = {
  id: 1337,
  name: "eip8141-devnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const wallet = createWalletClient({ account: privateKeyToAccount(PK), chain, transport: http(RPC) });
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const abi = JSON.parse(
  readFileSync(resolve(ROOT, "contracts/out/PermissionRegistry.sol/PermissionRegistry.json"), "utf8"),
).abi as Abi;

async function main(): Promise<void> {
  const hash = await wallet.writeContract({
    address: REGISTRY,
    abi,
    functionName: allow ? "allow" : "disallow",
    args: [ACCOUNT, VAULT, withdrawSelector],
    gas: 1_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${allow ? "allow" : "disallow"} failed: ${hash}`);

  const grant = (await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: "current",
    args: [ACCOUNT],
  })) as { version: bigint; grantHash: Hex };
  const allowed = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: "isAllowed",
    args: [ACCOUNT, VAULT, withdrawSelector],
  });

  console.log(`${allow ? "allowed" : "disallowed"} AgentVault.withdraw`);
  console.log(`  tx      ${hash}`);
  console.log(`  grant   v${grant.version} ${grant.grantHash}`);
  console.log(`  allowed ${allowed}`);
}

main().catch((error) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
});

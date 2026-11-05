/**
 * One-time devnet setup for the Axon demo.
 *
 *   1. fund the agent account
 *   2. stake it with the ERC-8421 registry (the contract must call `addStake` itself)
 *   3. owner grants the agent key a budget and allowlists `vault.rebalance`
 *   4. the account deposits into the vault
 *
 *   npx tsx scripts/setup.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "contracts/out");
const RPC = process.env.RPC ?? "https://altmempool.forshtat.com";

const OWNER_PK = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const AGENT_PK = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const REGISTRY = process.env.REGISTRY_ADDRESS as Address;
const VAULT = process.env.VAULT_ADDRESS as Address;
const ACCOUNT = process.env.ACCOUNT_ADDRESS as Address;
const STAKING = (process.env.STAKING_REGISTRY ?? "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f") as Address;
if (!OWNER_PK || !AGENT_PK) throw new Error("DEPLOYER_PRIVATE_KEY and AGENT_PRIVATE_KEY are required");

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

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  return JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), "utf8"));
}

const registryAbi = artifact("PermissionRegistry").abi;
const accountAbi = artifact("AgentAccount").abi;

const GAS = 2_000_000n;

async function send(hash: Hex, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed: ${hash}`);
  console.log(`${label.padEnd(28)} ${hash}`);
}

console.log("owner", owner.address);
console.log("agent", agent.address);
console.log("account", ACCOUNT);

// 1. Fund the account so it can stake and deposit.
await send(
  await wallet.sendTransaction({ to: ACCOUNT, value: parseEther("0.3"), gas: 300_000n }),
  "fund account",
);

// 2. Stake the account from the account itself (owner-gated forwarding call).
await send(
  await wallet.writeContract({
    address: ACCOUNT,
    abi: accountAbi,
    functionName: "stake",
    args: [STAKING, 86_400],
    value: parseEther("0.02"),
    gas: 1_000_000n,
  }),
  "account.addStake(86400)",
);

// 3. Owner grants the agent a 0.5 ETH/day budget for 7 days, and allowlists rebalance.
const now = BigInt(Math.floor(Date.now() / 1000));
await send(
  await wallet.writeContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "grantAgent",
    args: [ACCOUNT, agent.address, 1, parseEther("0.5"), 86_400n, now + 7n * 86_400n],
    gas: 1_000_000n,
  }),
  "registry.grantAgent",
);

await send(
  await wallet.writeContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "allow",
    args: [ACCOUNT, VAULT, toFunctionSelector("rebalance(uint256,uint256)")],
    gas: 1_000_000n,
  }),
  "registry.allow(rebalance)",
);

// 4. Credit the account inside the vault. `deposit()` must be called by the account.
await send(
  await wallet.writeContract({
    address: ACCOUNT,
    abi: accountAbi,
    functionName: "setupCall",
    args: [VAULT, parseEther("0.1"), toFunctionSelector("deposit()")],
    gas: 1_000_000n,
  }),
  "vault.deposit (via account)",
);

// Report.
const grant = (await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "current",
  args: [ACCOUNT],
})) as any;
const deposit = (await publicClient.readContract({
  address: STAKING,
  abi: [
    {
      type: "function",
      name: "getDepositInfo",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [
        { name: "stake", type: "uint256" },
        { name: "unstakeDelaySec", type: "uint32" },
        { name: "withdrawTime", type: "uint64" },
      ],
    },
  ] as const,
  functionName: "getDepositInfo",
  args: [ACCOUNT],
})) as readonly [bigint, number, bigint];

console.log("\ngrantHash ", grant.grantHash);
console.log("budget    ", grant.budgetPerEpoch.toString());
console.log("stake     ", deposit[0].toString(), "wei");
console.log("unlock at ", deposit[2].toString());

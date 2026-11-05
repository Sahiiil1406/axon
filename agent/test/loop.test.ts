import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadManifest } from "../../sdk/src/manifest.ts";
import type { Grant, SimulateResult, SubmitResult, VaultState } from "../../sdk/src/client.ts";
import type { Intent } from "../../sdk/src/builder.ts";
import { AgentLoop, toJson, type AgentClient } from "../src/loop.ts";
import { formatEth } from "../src/planner.ts";

const manifest = loadManifest(resolve(import.meta.dirname, "../../codegen/manifest.json"));
const ACCOUNT = "0x96a21935ddbf224d64efc933449016bbb4551a2e" as const;
const AGENT = "0x09c57921D33232f7B5bf1cFB0B3C2a084eE900a9" as const;
const OWNER = "0x0b012EEfCff398daB58e418d85e30398346a5c51" as const;
const NOW = 1_800_000_000n;

class FakeClient implements AgentClient {
  buildCalls = 0;
  simulateCalls = 0;
  submitCalls = 0;
  simStatus: "success" | "revert" = "success";
  status: SubmitResult["status"] = "OnChain";

  grant: Grant = {
    owner: OWNER,
    agentKey: AGENT,
    keyScheme: 0,
    budgetPerEpoch: 1_000_000_000_000_000_000n,
    epochLength: 86_400n,
    expiresAt: NOW + 86_400n,
    active: true,
    version: 3n,
    grantHash: `0x${"ab".repeat(32)}` as const,
  };

  vault: VaultState = {
    deposits: 200_000_000_000_000_000n,
    position: 0n,
    lastActionAt: 0n,
    maxTrade: 1_000_000_000_000_000_000n,
    cooldown: 30n,
    maxOracleAge: 60n,
    maxSlippageBps: 500n,
    price: 1_000_000_000_000_000_000n,
    oracleUpdatedAt: NOW,
    blockTimestamp: NOW,
  };

  remaining = 500_000_000_000_000_000n;

  async getGrant(): Promise<Grant> {
    return this.grant;
  }
  async getVaultState(): Promise<VaultState> {
    return this.vault;
  }
  async remainingBudget(): Promise<bigint> {
    return this.remaining;
  }
  async getIntentNonce(): Promise<bigint> {
    return 7n;
  }
  async isAllowed(): Promise<boolean> {
    return true;
  }
  async buildIntent(action: { address: `0x${string}` | null; selector: `0x${string}` }, _args: Record<string, unknown>, opts?: { value?: bigint; spend?: bigint }): Promise<Intent> {
    this.buildCalls++;
    return {
      target: action.address as `0x${string}`,
      selector: action.selector,
      args: "0x",
      value: opts?.value ?? 0n,
      spend: opts?.spend ?? 0n,
      nonce: 7n,
      deadline: NOW + 3600n,
      grantHash: this.grant.grantHash,
    };
  }
  async simulateIntent(): Promise<{ result: SimulateResult; raw: `0x${string}` }> {
    this.simulateCalls++;
    return {
      raw: "0x00",
      result: {
        canonicalMempoolValid: false,
        canonicalMempoolViolation: "StorageReadNonSender",
        erc7562Trace: [],
        erc7562TraceError: null,
        executionError: this.simStatus === "success" ? null : "0x" + Buffer.from("E_CALL_FAILED").toString("hex"),
        executionStatus: this.simStatus,
        frames: [{ gasUsed: "0x5208", succeeded: this.simStatus === "success" }],
        gasUsed: "0x5208",
        maxCost: "0x1",
        payer: ACCOUNT,
        prefixShape: "validate(bytes)",
      },
    };
  }
  async submitIntent(): Promise<SubmitResult> {
    this.submitCalls++;
    return { hash: `0x${"cd".repeat(32)}`, status: this.status, raw: "0x00", tx: {} as SubmitResult["tx"] };
  }
  async getAdmission() {
    return null;
  }
  explain(reason: string | null | undefined): string {
    if (reason == null) return "no reason given";
    const ascii = reason.startsWith("0x") ? Buffer.from(reason.slice(2), "hex").toString("ascii") : reason;
    return ascii === "E_CALL_FAILED" ? "E_CALL_FAILED: the target call reverted" : ascii;
  }
}

const loopWith = (client = new FakeClient()) =>
  new AgentLoop(manifest, client, ACCOUNT, AGENT);

test("loop: a clean run plans, simulates and never submits by default", async () => {
  const client = new FakeClient();
  const result = await loopWith(client).run({ action: "AgentVault.rebalance", amount: 20_000_000_000_000_000n });

  assert.equal(result.outcome, "simulated");
  assert.equal(client.buildCalls, 1);
  assert.equal(client.simulateCalls, 1);
  assert.equal(client.submitCalls, 0);
  assert.equal(result.plan?.rejected, false);
  assert.equal(result.simulation?.canonicalMempoolValid, false);
  assert.match(result.explanation ?? "", /public pool would reject/);
  assert.equal(result.intent?.spend, 20_000_000_000_000_000n);
});

test("loop: a budget rejection never builds or simulates a transaction", async () => {
  const client = new FakeClient();
  const result = await loopWith(client).run({
    action: "AgentVault.rebalance",
    amount: 20_000_000_000_000_000n,
    spend: 600_000_000_000_000_000n,
  });

  assert.equal(result.outcome, "rejected");
  assert.equal(result.explanation?.startsWith("budget-reserved"), true);
  assert.equal(client.buildCalls, 0);
  assert.equal(client.simulateCalls, 0);
});

test("loop: self-correct shrinks the spend to the remaining budget and retries once", async () => {
  const client = new FakeClient();
  const result = await loopWith(client).run({
    action: "AgentVault.rebalance",
    amount: 20_000_000_000_000_000n,
    spend: 600_000_000_000_000_000n,
    selfCorrect: true,
  });

  assert.equal(result.outcome, "simulated");
  assert.equal(result.plan?.corrected, true);
  assert.equal(result.plan?.spend, "500000000000000000");
  assert.equal(formatEth(BigInt(result.plan!.spend)), "0.5");
  assert.equal(client.buildCalls, 1);
});

test("loop: an execution failure is explained from the revert data", async () => {
  const client = new FakeClient();
  client.simStatus = "revert";
  const result = await loopWith(client).run({ action: "AgentVault.rebalance", amount: 20_000_000_000_000_000n });

  assert.equal(result.outcome, "failed");
  assert.match(result.explanation ?? "", /target call reverted/);
  assert.equal(client.submitCalls, 0);
});

test("loop: --submit sends the same intent and records the inclusion", async () => {
  const client = new FakeClient();
  const result = await loopWith(client).run(
    { action: "AgentVault.rebalance", amount: 20_000_000_000_000_000n },
    { submit: true },
  );

  assert.equal(result.outcome, "submitted");
  assert.equal(client.submitCalls, 1);
  assert.equal(result.submission?.status, "OnChain");
});

test("loop: a revoked grant is rejected before an intent exists", async () => {
  const client = new FakeClient();
  client.grant = { ...client.grant, active: false };
  const result = await loopWith(client).run({ action: "AgentVault.rebalance", amount: 20_000_000_000_000_000n });

  assert.equal(result.outcome, "rejected");
  assert.equal(result.plan?.checks[0].id, "grant-revoked");
  assert.equal(client.buildCalls, 0);
});

test("loop: results serialise without bigint", () => {
  const result = {
    plan: { spend: 1n },
    intent: { value: 2n, spend: 3n },
  } as unknown as Parameters<typeof toJson>[0];
  const text = toJson(result);
  assert.doesNotMatch(text, /bigint/);
  assert.match(text, /"spend": "1"/);
  JSON.parse(text);
});

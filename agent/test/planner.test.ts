import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadManifest, findAction } from "../../sdk/src/manifest.ts";
import { plan, formatEth, summarize, type AgentState, type PlanInput } from "../src/planner.ts";

const manifest = loadManifest(resolve(import.meta.dirname, "../../codegen/manifest.json"));
const rebalance = findAction(manifest, "AgentVault.rebalance");
const withdraw = findAction(manifest, "AgentVault.withdraw");

const OWNER = "0x0b012EEfCff398daB58e418d85e30398346a5c51" as const;
const AGENT = "0x09c57921D33232f7B5bf1cFB0B3C2a084eE900a9" as const;
const STRANGER = "0x1111111111111111111111111111111111111111" as const;
const NOW = 1_800_000_000n;

export function state(overrides: Partial<AgentState> = {}): AgentState {
  return {
    grant: {
      owner: OWNER,
      agentKey: AGENT,
      keyScheme: 0,
      budgetPerEpoch: 500_000_000_000_000_000n * 2n,
      epochLength: 86_400n,
      expiresAt: NOW + 86_400n,
      active: true,
      version: 3n,
      grantHash: `0x${"ab".repeat(32)}` as const,
    },
    vault: {
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
    },
    remainingBudget: 500_000_000_000_000_000n,
    intentNonce: 7n,
    allowed: true,
    ...overrides,
  };
}

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  action: rebalance,
  amount: 20_000_000_000_000_000n,
  ...overrides,
});

test("planner: a small rebalance passes every rule and picks the oracle floor", () => {
  const p = plan(input(), state());
  assert.equal(p.rejected, false);
  assert.deepEqual(p.rejections, []);
  assert.equal(p.args.amount, "20000000000000000");
  assert.equal(p.args.minOut, "19000000000000000");
  assert.equal(p.expectedOut, 20_000_000_000_000_000n);
  assert.equal(p.spend, 20_000_000_000_000_000n);
  assert.equal(summarize(p).startsWith("OK AgentVault.rebalance"), true);
});

test("planner: an over-budget spend is rejected with an actionable retry amount", () => {
  const p = plan(input({ spend: 600_000_000_000_000_000n }), state());
  assert.equal(p.rejected, true);
  const first = p.rejections[0];
  assert.equal(first.code, "budget-reserved");
  assert.equal(first.retryWith, 500_000_000_000_000_000n);
  assert.match(first.detail, /remaining 0.5 ETH, requested 0.6/);
  assert.match(first.detail, /retry with <= 0.5/);
});

test("planner: amount above the vault balance fails liquidity before it can run", () => {
  const p = plan(input({ amount: 300_000_000_000_000_000n }), state());
  assert.equal(p.rejected, true);
  const codes = p.rejections.map((r) => r.code);
  assert.deepEqual(codes, ["liquidity"]);
  assert.equal(p.rejections[0].retryWith, 200_000_000_000_000_000n);
});

test("planner: the protocol cooldown is reported with the wait time", () => {
  const s = state();
  s.vault.lastActionAt = NOW - 10n;
  const p = plan(input(), s);
  assert.equal(p.rejections[0].code, "cooldown");
  assert.equal(p.rejections[0].retryAfter, 20);
});

test("planner: a stale oracle is the owner's problem, not something the agent can fix", () => {
  const s = state();
  s.vault.oracleUpdatedAt = NOW - 120n;
  const p = plan(input(), s);
  assert.equal(p.rejections[0].code, "oracle-stale");
  assert.match(p.rejections[0].detail, /only the owner can refresh/);
});

test("planner: a revoked grant rejects before any other check can matter", () => {
  const s = state();
  s.grant.active = false;
  const p = plan(input(), s);
  assert.equal(p.rejected, true);
  assert.equal(p.checks[0].id, "grant-revoked");
});

test("planner: an unallowlisted target is rejected", () => {
  const p = plan(input(), state({ allowed: false }));
  assert.equal(p.rejections.some((r) => r.code === "target-denied"), true);
});

test("planner: withdraw to a stranger is blocked by the protocol, not the owner", () => {
  const p = plan(
    { action: withdraw, amount: 10_000_000_000_000_000n, to: STRANGER },
    state(),
  );
  assert.equal(p.rejected, true);
  const destination = p.rejections.find((r) => r.code === "destination");
  assert.ok(destination);
  assert.match(destination.detail, /protocol rule/);
});

test("planner: withdraw to the owner passes", () => {
  const p = plan({ action: withdraw, amount: 10_000_000_000_000_000n }, state());
  assert.equal(p.rejected, false);
  assert.equal(p.args.to, OWNER);
  assert.equal(p.minOut, 0n);
});

test("planner: minOut below the oracle floor is rejected", () => {
  const p = plan(input({ minOut: 1n }), state());
  assert.equal(p.rejections[0].code, "slippage");
});

test("planner: capToLimits shrinks an oversized amount and says so", () => {
  const p = plan(input({ amount: 300_000_000_000_000_000n, capToLimits: true }), state());
  assert.equal(p.rejected, false);
  assert.equal(p.args.amount, "200000000000000000");
  assert.equal(p.cappedFrom, 300_000_000_000_000_000n);
  assert.match(p.notes.join("\n"), /capped/);
});

test("planner: formatEth trims trailing zeros", () => {
  assert.equal(formatEth(0n), "0");
  assert.equal(formatEth(1_000_000_000_000_000_000n), "1");
  assert.equal(formatEth(120_000_000_000_000_000n), "0.12");
  assert.equal(formatEth(1n), "0.000000000000000001");
});

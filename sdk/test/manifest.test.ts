import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  coerceArgs,
  encodeActionCall,
  findAction,
  inputSchema,
  loadManifest,
  selectorOf,
} from "../src/manifest.ts";

const manifest = loadManifest(resolve(import.meta.dirname, "../../codegen/manifest.json"));

test("manifest: codegen found both annotated vault actions", () => {
  const ids = manifest.actions.map((a) => a.id).sort();
  assert.deepEqual(ids, ["AgentVault.rebalance", "AgentVault.withdraw"]);
});

test("manifest: selectors are derived from the canonical signature", () => {
  const rebalance = findAction(manifest, "AgentVault.rebalance");
  assert.equal(rebalance.signature, "rebalance(uint256,uint256)");
  assert.equal(rebalance.selector, "0xdf8879b8");
  assert.equal(selectorOf(rebalance), rebalance.selector);

  const withdraw = findAction(manifest, "AgentVault.withdraw");
  assert.equal(withdraw.signature, "withdraw(address,uint256)");
  assert.equal(withdraw.selector, "0xf3fef3a3");
});

test("manifest: actions carry the deployed address and policy tags", () => {
  const a = findAction(manifest, "AgentVault.rebalance");
  assert.equal(a.address, "0x5ea0d228af152b987c0a05d71527609744128996");
  assert.deepEqual(a.policy, ["max-trade", "oracle-freshness", "slippage", "cooldown"]);
  assert.match(a.description, /oracle price/);
});

test("manifest: the LLM tool schema uses strings for integers", () => {
  const a = findAction(manifest, "AgentVault.rebalance");
  const schema = inputSchema(a) as {
    properties: Record<string, { type: string; pattern?: string }>;
    required: string[];
  };
  assert.deepEqual(schema.required, ["amount", "minOut"]);
  assert.equal(schema.properties.amount.type, "string");
  assert.equal(schema.properties.amount.pattern, "^[0-9]+$");
});

test("manifest: model output is coerced to bigint, unknown keys are rejected", () => {
  const a = findAction(manifest, "AgentVault.rebalance");
  assert.deepEqual(coerceArgs(a, { amount: "20000000000000000", minOut: "19000000000000000" }), [
    20000000000000000n,
    19000000000000000n,
  ]);
  assert.throws(() => coerceArgs(a, { amount: "1", minOut: "1", to: "0x0" }), /unknown argument/);
  assert.throws(() => coerceArgs(a, { amount: "1" }), /missing argument/);
  // JSON numbers beyond 2^53 lose precision before we ever see them.
  assert.throws(() => coerceArgs(a, { amount: 19000000000000000, minOut: "1" }), /expected an integer/);
});

test("manifest: an action encodes to its selector plus ABI args", () => {
  const a = findAction(manifest, "AgentVault.rebalance");
  const call = encodeActionCall(a, [10n ** 16n, 9n * 10n ** 15n]);
  assert.equal(call.slice(0, 10), a.selector);
  assert.equal(call.length, 10 + 64 * 2);
});

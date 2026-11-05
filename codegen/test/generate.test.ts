import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  generateManifest,
  sameManifest,
  type Manifest,
} from "../src/generate.ts";

const ROOT = resolve(import.meta.dirname, "../..");

test("generate: the annotated vault surface becomes the manifest", () => {
  const manifest = generateManifest({ root: ROOT, generatedAt: "fixed" });

  const actions = manifest.actions.map((a) => a.id);
  assert.deepEqual(actions, ["AgentVault.rebalance", "AgentVault.withdraw"]);

  const rebalance = manifest.actions[0];
  assert.equal(rebalance.contract, "AgentVault");
  assert.equal(rebalance.signature, "rebalance(uint256,uint256)");
  assert.equal(rebalance.selector, "0xdf8879b8");
  assert.equal(rebalance.address, "0x5ea0d228af152b987c0a05d71527609744128996");
  assert.deepEqual(rebalance.inputs.map((i) => i.name), ["amount", "minOut"]);
  assert.equal(rebalance.stateMutability, "nonpayable");
  assert.deepEqual(rebalance.policy, [
    "max-trade",
    "oracle-freshness",
    "slippage",
    "cooldown",
  ]);
  assert.match(rebalance.description, /oracle price/);
  assert.equal(rebalance.source, "contracts/src/demo/AgentVault.sol");
});

test("generate: every action selector matches its signature", () => {
  const manifest = generateManifest({ root: ROOT, generatedAt: "fixed" });
  for (const action of manifest.actions) {
    assert.equal(action.selector.length, 10);
    assert.equal(action.signature, `${action.name}(${action.inputs.map((i) => i.type).join(",")})`);
  }
});

test("generate: the committed manifest is current", () => {
  const committed = JSON.parse(
    readFileSync(resolve(ROOT, "codegen/manifest.json"), "utf8"),
  ) as Manifest;
  const generated = generateManifest({ root: ROOT });
  assert.equal(sameManifest(committed, generated), true);
});

test("generate: a stale manifest is detected even when only a selector changes", () => {
  const a = generateManifest({ root: ROOT, generatedAt: "one" });
  const b = structuredClone(a);
  b.actions[0].selector = "0xdeadbeef";
  assert.equal(sameManifest(a, b), false);
  assert.equal(sameManifest(a, generateManifest({ root: ROOT, generatedAt: "two" })), true);
});

test("generate: an annotation without a compiled artifact fails loudly", () => {
  const root = mkdtempSync(join(tmpdir(), "axon-codegen-"));
  mkdirSync(join(root, "contracts/src"), { recursive: true });
  writeFileSync(join(root, "deployments.json"), JSON.stringify({ chainId: 1337 }));
  writeFileSync(
    join(root, "contracts/src/Thing.sol"),
    `contract Thing {
        /// @custom:agent-action poke(uint256 x)
        function poke(uint256 x) external {}
      }`,
  );
  assert.throws(() => generateManifest({ root }), /has no artifact/);
});

test("generate: an annotation above a differently-named function fails", () => {
  const root = mkdtempSync(join(tmpdir(), "axon-codegen-"));
  mkdirSync(join(root, "contracts/src"), { recursive: true });
  writeFileSync(join(root, "deployments.json"), JSON.stringify({ chainId: 1337 }));
  writeFileSync(
    join(root, "contracts/src/Thing.sol"),
    `contract Thing {
        /// @custom:agent-action poke(uint256 x)
        function prod(uint256 x) external {}
      }`,
  );
  assert.throws(() => generateManifest({ root }), /names must match/);
});

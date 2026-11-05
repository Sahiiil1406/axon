import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadManifest } from "../../sdk/src/manifest.ts";
import { actionToolName, buildTools, findTool } from "../src/tools.ts";

const manifest = loadManifest(resolve(import.meta.dirname, "../../codegen/manifest.json"));

test("tools: the five loop tools are always present", () => {
  const names = buildTools(manifest).map((t) => t.name);
  for (const name of ["get_grant", "quote", "build_intent", "submit", "explain_rejection"]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
});

test("tools: one tool per annotated action, named safely", () => {
  const names = buildTools(manifest).map((t) => t.name);
  assert.ok(names.includes("AgentVault_rebalance"));
  assert.ok(names.includes("AgentVault_withdraw"));
  assert.equal(actionToolName(manifest.actions[0]), "AgentVault_rebalance");
  // Function-call names cannot contain a dot.
  assert.equal(names.every((n) => /^[a-zA-Z0-9_-]{1,64}$/.test(n)), true);
});

test("tools: a generated action tool carries the manifest schema", () => {
  const tool = findTool(manifest, "AgentVault_rebalance");
  assert.ok(tool);
  const schema = tool.inputSchema as {
    properties: Record<string, { type: string; pattern?: string }>;
    required: string[];
    additionalProperties: boolean;
  };
  assert.deepEqual(schema.required, ["amount", "minOut"]);
  assert.equal(schema.properties.amount.type, "string");
  assert.equal(schema.properties.amount.pattern, "^[0-9]+$");
  assert.equal(schema.additionalProperties, false);
  assert.match(tool.description, /Protocol policy: max-trade/);
});

test("tools: build_intent only accepts manifest action ids", () => {
  const tool = findTool(manifest, "build_intent");
  assert.ok(tool);
  const schema = tool.inputSchema as { properties: { action: { enum: string[] } } };
  assert.deepEqual(schema.properties.action.enum, [
    "AgentVault.rebalance",
    "AgentVault.withdraw",
  ]);
});

test("tools: an unknown action has no tool", () => {
  assert.equal(findTool(manifest, "AgentVault.drain"), undefined);
});

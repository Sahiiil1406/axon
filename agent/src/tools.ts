import { inputSchema, type Manifest, type ManifestAction } from "../../sdk/src/manifest.ts";

/**
 * Tool definitions are generated from `codegen/manifest.json`. If the contract
 * did not annotate an action, it does not exist as a tool — the model cannot
 * hallucinate a call the account would reject anyway.
 *
 * These are plain JSON Schema objects, the shape OpenAI/Anthropic-compatible
 * function calling expects. No SDK dependency, so the same catalogue feeds the
 * deterministic loop, an LLM, or a UI.
 */

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ActionTool {
  name: string;
  action: ManifestAction;
  spec: ToolSpec;
}

/** Function names cannot contain `.`, so `AgentVault.rebalance` → `AgentVault_rebalance`. */
export function actionToolName(action: ManifestAction): string {
  return action.id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function actionTools(manifest: Manifest): ActionTool[] {
  return manifest.actions.map((action) => ({
    name: actionToolName(action),
    action,
    spec: {
      name: actionToolName(action),
      description: [
        action.description,
        `Calls ${action.signature} on ${action.contract}${action.address ? ` at ${action.address}` : ""}.`,
        action.policy.length > 0 ? `Protocol policy: ${action.policy.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      inputSchema: inputSchema(action),
    },
  }));
}

function catalogueText(manifest: Manifest): string {
  return manifest.actions
    .map((a) => {
      const fields = a.inputs
        .map((i) => `${i.name}:${i.type}`)
        .join(", ");
      return `${a.id}(${fields}) — ${a.description}`;
    })
    .join("\n");
}

const OBJECT = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const UINT = {
  type: "string",
  pattern: "^[0-9]+$",
  description: "Base-10 string in wei (JSON has no bigint).",
} as const;

/**
 * The five loop tools from the plan, plus one generated tool per annotated
 * action. The per-action tools are the convenient surface for a model; the
 * generic `build_intent`/`submit` pair is what the deterministic loop uses.
 */
export function buildTools(manifest: Manifest): ToolSpec[] {
  return [
    {
      name: "get_grant",
      description:
        "Read the account's current grant: owner, agent key, budget per epoch, remaining spend, expiry and version.",
      inputSchema: OBJECT({}),
    },
    {
      name: "quote",
      description: "Read the oracle price and the expected output for an ETH amount, plus the slippage floor.",
      inputSchema: OBJECT({ amount: UINT }, ["amount"]),
    },
    {
      name: "build_intent",
      description:
        `Plan and simulate an action without submitting it. Actions:\n${catalogueText(manifest)}`,
      inputSchema: OBJECT(
        {
          action: { type: "string", enum: manifest.actions.map((a) => a.id) },
          arguments: { type: "object", description: "Action arguments, shaped per the action's schema." },
          spend: UINT,
          deadlineSeconds: { type: "integer", minimum: 1 },
        },
        ["action", "arguments"],
      ),
    },
    {
      name: "submit",
      description: "Build, sign, simulate and submit a frame transaction to the alt mempool, then report its status.",
      inputSchema: OBJECT(
        {
          action: { type: "string", enum: manifest.actions.map((a) => a.id) },
          arguments: { type: "object" },
          spend: UINT,
          deadlineSeconds: { type: "integer", minimum: 1 },
        },
        ["action", "arguments"],
      ),
    },
    {
      name: "explain_rejection",
      description: "Translate an admission code or revert reason into remediation text.",
      inputSchema: OBJECT({ reason: { type: "string" } }, ["reason"]),
    },
    ...actionTools(manifest).map((t) => t.spec),
  ];
}

/** JSON Schema for one action, useful as a prompt fragment. */
export function actionSchema(action: ManifestAction): Record<string, unknown> {
  return inputSchema(action);
}

/** Look up a tool by name, including the per-action aliases. */
export function findTool(manifest: Manifest, name: string): ToolSpec | undefined {
  return buildTools(manifest).find((t) => t.name === name);
}

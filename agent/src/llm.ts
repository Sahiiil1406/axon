import type { Manifest } from "../../sdk/src/manifest.ts";
import { buildTools } from "./tools.ts";

/**
 * Optional model layer. It only *chooses* an action and arguments; the loop
 * still plans, simulates and submits through the account. The demo works with
 * `--no-llm` (the default) and never depends on a provider being reachable.
 *
 * Any OpenAI-compatible `/chat/completions` endpoint works, including local
 * servers. Configuration:
 *
 *   AXON_LLM_BASE_URL  default https://api.openai.com/v1
 *   AXON_LLM_API_KEY   required
 *   AXON_LLM_MODEL     default gpt-4.1-mini
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmChoice {
  action: string;
  arguments: Record<string, unknown>;
  spend?: string;
  deadlineSeconds?: number;
  reason?: string;
}

export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env.AXON_LLM_API_KEY;
  if (apiKey == null || apiKey === "") return null;
  return {
    baseUrl: env.AXON_LLM_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
    model: env.AXON_LLM_MODEL ?? "gpt-4.1-mini",
  };
}

const SYSTEM = `You are Axon, an autonomous agent operating a smart account under a revocable grant.
You may only choose from the provided tools. Prefer the smallest action that satisfies the goal.
Amounts are base-10 strings in wei. Never invent an action that is not in the tool list.`;

interface ChatToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
  }[];
  error?: { message?: string };
}

/**
 * Ask a model what to do. Returns the first tool call, normalised to the
 * generic `{ action, arguments }` shape the loop understands.
 */
export async function chooseAction(
  config: LlmConfig,
  manifest: Manifest,
  stateSummary: string,
  goal: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmChoice> {
  const tools = buildTools(manifest).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const res = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      tools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Current state:\n${stateSummary}\n\nGoal: ${goal}\n\nCall exactly one tool.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as ChatResponse;
  if (json.error) throw new Error(`LLM: ${json.error.message ?? "unknown error"}`);

  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (call?.function?.name == null) {
    const content = json.choices?.[0]?.message?.content ?? "";
    throw new Error(`LLM returned no tool call${content ? `: ${content}` : ""}`);
  }

  const name = call.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`LLM returned invalid tool arguments for ${name}`);
  }

  if (name === "build_intent" || name === "submit") {
    const action = String(args.action ?? "");
    const actionArgs = (args.arguments ?? {}) as Record<string, unknown>;
    if (action === "") throw new Error("LLM called build_intent without an action");
    return {
      action,
      arguments: actionArgs,
      spend: args.spend as string | undefined,
      deadlineSeconds: args.deadlineSeconds as number | undefined,
    };
  }

  if (name === "get_grant" || name === "quote" || name === "explain_rejection") {
    throw new Error(`LLM called a read-only tool (${name}) when an action was expected`);
  }

  // A per-action tool: `AgentVault_rebalance` → action id, arguments as given.
  const action = manifest.actions.find((a) => a.id.replace(/[^a-zA-Z0-9_-]/g, "_") === name);
  if (action == null) throw new Error(`LLM called unknown tool ${name}`);
  return { action: action.id, arguments: args };
}

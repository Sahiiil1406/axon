import type { ExplorerAdmission, Grant, IntentStatus, SimulateResult, SubmitResult, VaultState } from "../../sdk/src/client.ts";
import type { Intent } from "../../sdk/src/builder.ts";
import { findAction, type Manifest, type ManifestAction } from "../../sdk/src/manifest.ts";
import { formatEth, plan, summarize, type AgentState, type PlanInput, type Plan } from "./planner.ts";
import { buildTools, type ToolSpec } from "./tools.ts";

/**
 * The loop is deterministic by default:
 *
 *   observe → plan → build intent → simulate → (submit) → explain
 *
 * A model, when enabled, only chooses *which* action and arguments to try. It
 * cannot skip the planner, the simulator, or the account's own validation
 * frame, so an LLM cannot widen its own authority. Every step is recorded, so
 * the demo replays without a network model.
 */

export interface AgentClient {
  getGrant(): Promise<Grant>;
  getVaultState(): Promise<VaultState>;
  remainingBudget(): Promise<bigint>;
  getIntentNonce(): Promise<bigint>;
  isAllowed(target: `0x${string}`, selector: `0x${string}`): Promise<boolean>;
  buildIntent(
    action: ManifestAction,
    rawArgs: Record<string, unknown>,
    opts?: { value?: bigint; spend?: bigint; deadlineSeconds?: number },
  ): Promise<Intent>;
  simulateIntent(intent: Intent): Promise<{ result: SimulateResult; raw: `0x${string}` }>;
  submitIntent(
    intent: Intent,
    opts?: { timeoutMs?: number; pollMs?: number },
  ): Promise<SubmitResult>;
  getAdmission(hash: `0x${string}`): Promise<ExplorerAdmission | null>;
  explain(reason: string | null | undefined): string;
}

export interface LoopRequest {
  /** Manifest action id, name, or selector. */
  action: string;
  amount?: bigint;
  minOut?: bigint;
  to?: `0x${string}`;
  spend?: bigint;
  slippageBps?: bigint;
  deadlineSeconds?: number;
  /** Reduce an over-budget amount to the largest allowed value and retry once. */
  selfCorrect?: boolean;
}

export interface LoopOptions {
  submit?: boolean;
  timeoutMs?: number;
  pollMs?: number;
}

export interface SimulationSummary {
  executionStatus: string | null;
  executionError: string | null;
  canonicalMempoolValid: boolean | null;
  canonicalMempoolViolation: string | null;
  gasUsed: string | null;
  frames: { gasUsed: string; succeeded: boolean }[] | null;
}

export type LoopOutcome = "rejected" | "simulated" | "submitted" | "failed";

export interface LoopResult {
  account: string;
  agent: string;
  request: {
    action: string;
    amount?: string;
    minOut?: string;
    to?: string;
    spend?: string;
    deadlineSeconds?: number;
    selfCorrect: boolean;
  };
  state: {
    blockTimestamp: string;
    grantVersion: string;
    grantActive: boolean;
    grantHash: string;
    budgetPerEpoch: string;
    remainingBudget: string;
    intentNonce: string;
    deposits: string;
    maxTrade: string;
    cooldown: string;
    oracleAge: string;
    oraclePrice: string;
  };
  /** Serializable form of the planner's output. */
  plan: {
    action: string;
    args: Record<string, string>;
    spend: string;
    expectedOut: string;
    minOut: string;
    rejected: boolean;
    checks: { id: string; status: string; detail: string }[];
    rejections: { code: string; detail: string; retryWith?: string; retryAfter?: number }[];
    notes: string[];
    corrected: boolean;
  } | null;
  intent: Intent | null;
  simulation: SimulationSummary | null;
  submission: { hash: string; status: IntentStatus; admission: unknown } | null;
  explanation: string | null;
  outcome: LoopOutcome;
  logs: string[];
}

export class AgentLoop {
  constructor(
    readonly manifest: Manifest,
    readonly client: AgentClient,
    readonly account: `0x${string}`,
    readonly agent: `0x${string}`,
  ) {}

  tools(): ToolSpec[] {
    return buildTools(this.manifest);
  }

  /** Read everything a decision needs in one round trip. */
  async observe(action: ManifestAction): Promise<AgentState> {
    const [grant, vault, remainingBudget, intentNonce, allowed] = await Promise.all([
      this.client.getGrant(),
      this.client.getVaultState(),
      this.client.remainingBudget(),
      this.client.getIntentNonce(),
      action.address == null ? Promise.resolve(false) : this.client.isAllowed(action.address, action.selector),
    ]);
    return { grant, vault, remainingBudget, intentNonce, allowed };
  }

  private planRequest(request: LoopRequest, action: ManifestAction): PlanInput {
    return {
      action,
      amount: request.amount,
      minOut: request.minOut,
      to: request.to,
      spend: request.spend,
      slippageBps: request.slippageBps,
      deadlineSeconds: request.deadlineSeconds,
    };
  }

  async run(request: LoopRequest, options: LoopOptions = {}): Promise<LoopResult> {
    const logs: string[] = [];
    const action = findAction(this.manifest, request.action);
    const state = await this.observe(action);
    logs.push(
      `observe: grant v${state.grant.version} active=${state.grant.active} remaining=${formatEth(state.remainingBudget)} ETH deposits=${formatEth(state.vault.deposits)}`,
    );

    let plannerInput = this.planRequest(request, action);
    let planned: Plan = plan(plannerInput, state);
    let corrected = false;

    if (planned.rejected && request.selfCorrect === true) {
      const fix = this.selfCorrect(planned, plannerInput);
      if (fix != null) {
        const retried = plan(fix, state);
        if (!retried.rejected) {
          corrected = true;
          plannerInput = fix;
          planned = retried;
          logs.push(`self-correct: ${summarize(planned)}`);
        }
      }
    }

    const result: LoopResult = {
      account: this.account,
      agent: this.agent,
      request: {
        action: action.id,
        amount: request.amount?.toString(),
        minOut: request.minOut?.toString(),
        to: request.to,
        spend: request.spend?.toString(),
        deadlineSeconds: request.deadlineSeconds,
        selfCorrect: request.selfCorrect === true,
      },
      state: {
        blockTimestamp: state.vault.blockTimestamp.toString(),
        grantVersion: state.grant.version.toString(),
        grantActive: state.grant.active,
        grantHash: state.grant.grantHash,
        budgetPerEpoch: state.grant.budgetPerEpoch.toString(),
        remainingBudget: state.remainingBudget.toString(),
        intentNonce: state.intentNonce.toString(),
        deposits: state.vault.deposits.toString(),
        maxTrade: state.vault.maxTrade.toString(),
        cooldown: state.vault.cooldown.toString(),
        oracleAge: (state.vault.blockTimestamp - state.vault.oracleUpdatedAt).toString(),
        oraclePrice: state.vault.price.toString(),
      },
      plan: serializePlan(planned, corrected),
      intent: null,
      simulation: null,
      submission: null,
      explanation: null,
      outcome: "failed",
      logs,
    };

    logs.push(`plan: ${summarize(planned)}`);
    for (const check of planned.checks) logs.push(`  ${check.status.padEnd(4)} ${check.id}: ${check.detail}`);

    if (planned.rejected) {
      const first = planned.rejections[0];
      result.outcome = "rejected";
      result.explanation = `${first.code}: ${first.detail}`;
      if (first.retryAfter !== undefined) {
        result.explanation += ` (retry in ${first.retryAfter}s)`;
      }
      logs.push(`explain: ${result.explanation}`);
      return result;
    }

    // The intent carries the planned arguments, but buildIntent re-reads the
    // grant hash and nonce so a concurrent update fails closed in validate().
    const deadlineSeconds = request.deadlineSeconds ?? 3600;
    const intent = await this.client.buildIntent(action, planned.args, {
      value: planned.value,
      spend: planned.spend,
      deadlineSeconds,
    });
    result.intent = intent;
    logs.push(`intent: nonce=${intent.nonce} spend=${formatEth(intent.spend)} deadline=${intent.deadline}`);

    let simulation: { result: SimulateResult; raw: `0x${string}` };
    try {
      simulation = await this.client.simulateIntent(intent);
    } catch (error) {
      result.outcome = "failed";
      result.explanation = `simulation failed: ${(error as Error).message}`;
      logs.push(`simulate: ${result.explanation}`);
      return result;
    }

    const sim = simulation.result;
    result.simulation = {
      executionStatus: sim.executionStatus,
      executionError: sim.executionError,
      canonicalMempoolValid: sim.canonicalMempoolValid,
      canonicalMempoolViolation: sim.canonicalMempoolViolation,
      gasUsed: sim.gasUsed,
      frames: sim.frames,
    };
    logs.push(
      `simulate: execution=${sim.executionStatus} canonicalMempoolValid=${sim.canonicalMempoolValid} gasUsed=${sim.gasUsed}`,
    );

    if (sim.executionStatus !== "success") {
      result.outcome = "failed";
      result.explanation = this.client.explain(sim.executionError);
      if (sim.canonicalMempoolViolation != null) {
        result.explanation += ` (public-pool rule: ${sim.canonicalMempoolViolation})`;
      }
      logs.push(`explain: ${result.explanation}`);
      return result;
    }

    if (options.submit !== true) {
      result.outcome = "simulated";
      result.explanation = sim.canonicalMempoolValid === false
        ? `simulation succeeds; the public pool would reject this tx (${sim.canonicalMempoolViolation ?? "validation rule"}), which is why it goes to the alt mempool`
        : "simulation succeeds";
      logs.push(`explain: ${result.explanation}`);
      return result;
    }

    const submission = await this.client.submitIntent(intent, {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
    });
    result.submission = { hash: submission.hash, status: submission.status, admission: null };
    logs.push(`submit: ${submission.hash} → ${submission.status}`);

    if (submission.status === "Reverted") {
      const admission = await this.client.getAdmission(submission.hash).catch(() => null);
      result.submission.admission = admission;
      const failed = admission?.checks.filter((c) => c.verdict === "fail") ?? [];
      result.outcome = "failed";
      result.explanation = failed.length > 0
        ? failed.map((c) => `${c.rule}: ${c.reason ?? "rejected"}`).join("; ")
        : "the frame transaction reverted on execution";
      logs.push(`explain: ${result.explanation}`);
      return result;
    }

    result.outcome = "submitted";
    result.explanation = `included by the alt mempool with status ${submission.status}`;
    logs.push(`explain: ${result.explanation}`);
    return result;
  }

  /** At most one correction, and only for rules with a numeric fix. */
  private selfCorrect(planned: Plan, input: PlanInput): PlanInput | null {
    for (const rejection of planned.rejections) {
      if (rejection.retryWith === undefined) continue;
      if (rejection.code === "budget-reserved") {
        return { ...input, spend: rejection.retryWith };
      }
      const amount = rejection.retryWith;
      return {
        ...input,
        amount,
        spend: input.spend !== undefined && input.spend > amount ? amount : input.spend,
      };
    }
    return null;
  }
}

export function serializePlan(planned: Plan, corrected: boolean): LoopResult["plan"] {
  return {
    action: planned.action.id,
    args: planned.args,
    spend: planned.spend.toString(),
    expectedOut: planned.expectedOut.toString(),
    minOut: planned.minOut.toString(),
    rejected: planned.rejected,
    checks: planned.checks,
    rejections: planned.rejections.map((r) => ({
      code: r.code,
      detail: r.detail,
      retryWith: r.retryWith?.toString(),
      retryAfter: r.retryAfter,
    })),
    notes: planned.notes,
    corrected,
  };
}

/** JSON-safe (bigint → base-10 string) form for fixtures and the dashboard. */
export function toJson(result: LoopResult): string {
  return JSON.stringify(
    result,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

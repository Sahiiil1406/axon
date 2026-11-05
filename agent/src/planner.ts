import type { Grant, VaultState } from "../../sdk/src/client.ts";
import type { ManifestAction } from "../../sdk/src/manifest.ts";

/**
 * Planning is pure: it takes a snapshot of chain state and a request, and returns
 * either a plan the loop can turn into an Intent, or machine-readable reasons it
 * should not try. No RPC, no keys, no model — every demo beat can be replayed.
 *
 * The checks mirror, in order, the rules the transaction would actually hit:
 *
 *   grant active → not expired → target allowlisted → oracle fresh → cooldown
 *   → size → liquidity → slippage → epoch budget
 *
 * A rejection here costs nothing. The same violation at runtime costs a
 * signature, a simulation, and (if the guard were missing) gas.
 */

export interface AgentState {
  grant: Grant;
  vault: VaultState;
  remainingBudget: bigint;
  intentNonce: bigint;
  /** `registry.isAllowed(account, action.address, action.selector)`. */
  allowed: boolean;
}

export interface PlanInput {
  action: ManifestAction;
  /** Base units. Defaults to the largest safe amount within the limits. */
  amount?: bigint;
  /** Vault-provided expected output floor. Defaults to the oracle floor. */
  minOut?: bigint;
  /** Withdraw destination. Defaults to the account owner. */
  to?: `0x${string}`;
  /** Overrides the protocol's max slippage when choosing a default `minOut`. */
  slippageBps?: bigint;
  /** Budget the intent claims. Defaults to `amount`. */
  spend?: bigint;
  deadlineSeconds?: number;
  /** If true, reduce a rejected amount to the largest allowed value and re-plan once. */
  capToLimits?: boolean;
}

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  id: string;
  status: CheckStatus;
  detail: string;
}

export interface Rejection {
  code: string;
  detail: string;
  /** Largest amount that would satisfy this rule, when one exists. */
  retryWith?: bigint;
  /** Seconds until the rule can pass, for time-based rules. */
  retryAfter?: number;
}

export interface Plan {
  action: ManifestAction;
  /** Manifest-shaped arguments: base-10 strings for integers. */
  args: Record<string, string>;
  value: bigint;
  spend: bigint;
  expectedOut: bigint;
  minOut: bigint;
  checks: Check[];
  rejected: boolean;
  rejections: Rejection[];
  notes: string[];
  /** Set when `capToLimits` changed the requested amount. */
  cappedFrom?: bigint;
}

export function formatEth(wei: bigint): string {
  const sign = wei < 0n ? "-" : "";
  const abs = wei < 0n ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac === "" ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
}

const min = (...values: bigint[]): bigint => values.reduce((a, b) => (a < b ? a : b));

function amountLimit(state: AgentState, action: ManifestAction): { value: bigint; why: string } {
  if (action.name === "rebalance") {
    const cap = min(state.vault.maxTrade, state.vault.deposits, state.remainingBudget);
    return { value: cap, why: "max trade / vault balance / epoch budget" };
  }
  const cap = min(state.vault.deposits, state.remainingBudget);
  return { value: cap, why: "vault balance / epoch budget" };
}

export function plan(input: PlanInput, state: AgentState): Plan {
  let amount = input.amount ?? amountLimit(state, input.action).value;
  let cappedFrom: bigint | undefined;

  if (input.capToLimits === true) {
    const limit = amountLimit(state, input.action).value;
    if (amount > limit) {
      cappedFrom = amount;
      amount = limit;
    }
  }

  const checks: Check[] = [];
  const rejections: Rejection[] = [];
  const notes: string[] = [];

  const fail = (code: string, detail: string, extra: Partial<Rejection> = {}) => {
    checks.push({ id: code, status: "fail", detail });
    rejections.push({ code, detail, ...extra });
  };
  const ok = (id: string, detail: string) => checks.push({ id, status: "ok", detail });
  const warn = (id: string, detail: string) => checks.push({ id, status: "warn", detail });

  // -- authority ---------------------------------------------------------
  if (state.grant.owner === "0x0000000000000000000000000000000000000000" || state.grant.agentKey === "0x0000000000000000000000000000000000000000") {
    fail("grant-missing", "the account has no grant");
  } else if (!state.grant.active) {
    fail("grant-revoked", "the owner revoked the grant; no intent can pass validate()");
  } else {
    ok("grant", `active, version ${state.grant.version}`);
  }

  if (state.grant.expiresAt !== 0n && state.vault.blockTimestamp > state.grant.expiresAt) {
    fail("grant-expired", `grant expired at ${state.grant.expiresAt}; ask the owner to renew`);
  } else if (state.grant.expiresAt !== 0n) {
    const left = state.grant.expiresAt - state.vault.blockTimestamp;
    if (left < 3600n) warn("grant-expiry", `the grant expires in ${left}s`);
  }

  if (input.action.address == null) {
    fail("no-address", `${input.action.id} has no deployed address in the manifest`);
  } else if (!state.allowed) {
    fail("target-denied", `${input.action.id} is not allowlisted for this account`);
  } else {
    ok("allowed", `${input.action.id} is allowlisted`);
  }

  // -- protocol preconditions -------------------------------------------
  const now = state.vault.blockTimestamp;
  const oracleAge = now > state.vault.oracleUpdatedAt ? now - state.vault.oracleUpdatedAt : 0n;
  if (oracleAge > state.vault.maxOracleAge) {
    fail(
      "oracle-stale",
      `the oracle is ${oracleAge}s old (max ${state.vault.maxOracleAge}s); only the owner can refresh it`,
    );
  } else {
    ok("oracle", `price ${state.vault.price} at ${oracleAge}s old`);
  }

  if (input.action.name === "rebalance") {
    const last = state.vault.lastActionAt;
    if (last !== 0n && now < last + state.vault.cooldown) {
      const wait = Number(last + state.vault.cooldown - now);
      fail("cooldown", `protocol cooldown: wait ${wait}s (last action ${now - last}s ago)`, {
        retryAfter: wait,
      });
    } else {
      ok("cooldown", last === 0n ? "no previous action" : "elapsed");
    }
  }

  if (amount === 0n) {
    fail("size", "amount is zero", { retryWith: amountLimit(state, input.action).value });
  } else if (input.action.name === "rebalance" && amount > state.vault.maxTrade) {
    fail("size", `amount ${formatEth(amount)} exceeds MAX_TRADE ${formatEth(state.vault.maxTrade)}`, {
      retryWith: state.vault.maxTrade,
    });
  } else {
    ok("size", `${formatEth(amount)} ETH`);
  }

  if (amount > state.vault.deposits) {
    fail(
      "liquidity",
      `amount ${formatEth(amount)} exceeds the account's vault balance ${formatEth(state.vault.deposits)}`,
      { retryWith: state.vault.deposits },
    );
  } else {
    ok("liquidity", `${formatEth(state.vault.deposits)} ETH deposited`);
  }

  if (input.action.name === "withdraw") {
    const to = input.to ?? state.grant.owner;
    if (to.toLowerCase() !== state.grant.owner.toLowerCase()) {
      fail(
        "destination",
        `withdraw may only pay the owner ${state.grant.owner}; ${to} is a stranger (protocol rule)`,
      );
    } else {
      ok("destination", `pays the owner ${state.grant.owner}`);
    }
    notes.push("withdraw is paid out of the vault's deposit, not the intent value");
  }

  // -- economics ---------------------------------------------------------
  const hasMinOut = input.action.inputs.some((i) => i.name === "minOut");
  const bps = input.slippageBps ?? state.vault.maxSlippageBps;
  const expectedOut = hasMinOut ? (amount * state.vault.price) / 10n ** 18n : 0n;
  const floor = hasMinOut ? (expectedOut * (10_000n - state.vault.maxSlippageBps)) / 10_000n : 0n;
  const minOut = input.minOut ?? floor;

  if (hasMinOut) {
    if (bps > state.vault.maxSlippageBps) {
      fail(
        "slippage-policy",
        `requested ${bps} bps of slippage, the protocol allows ${state.vault.maxSlippageBps}`,
      );
    }
    if (minOut < floor) {
      fail(
        "slippage",
        `minOut ${minOut} is below the oracle floor ${floor} (${formatEth(expectedOut)} out, ${state.vault.maxSlippageBps} bps tolerance)`,
      );
    } else {
      ok("slippage", `minOut ${minOut} ≥ floor ${floor}`);
    }
  }

  const spend = input.spend ?? amount;
  if (spend > state.remainingBudget) {
    fail(
      "budget-reserved",
      `remaining ${formatEth(state.remainingBudget)} ETH, requested ${formatEth(spend)} — retry with <= ${formatEth(state.remainingBudget)}`,
      { retryWith: state.remainingBudget },
    );
  } else {
    ok("budget-reserved", `${formatEth(spend)} of ${formatEth(state.remainingBudget)} remaining`);
  }

  if (cappedFrom !== undefined) {
    notes.push(`capped ${formatEth(cappedFrom)} ETH to ${formatEth(amount)} ETH (${amountLimit(state, input.action).why})`);
  }

  const args: Record<string, string> = {};
  if (input.action.name === "rebalance") {
    args.amount = amount.toString();
    args.minOut = minOut.toString();
  } else if (input.action.name === "withdraw") {
    args.to = input.to ?? state.grant.owner;
    args.amount = amount.toString();
  } else {
    // Unknown actions are still planned generically so a new annotated contract
    // works without editing this file.
    input.action.inputs.forEach((i, index) => {
      const value = index === 0 && input.amount !== undefined ? input.amount : undefined;
      if (value !== undefined) args[i.name] = value.toString();
    });
    notes.push(`${input.action.id} has no specialised planner; supply arguments explicitly`);
  }

  return {
    action: input.action,
    args,
    value: 0n,
    spend,
    expectedOut,
    minOut,
    checks,
    rejected: rejections.length > 0,
    rejections,
    notes,
    cappedFrom,
  };
}

/** One-line summary for a CLI or a dashboard row. */
export function summarize(plan: Plan): string {
  if (plan.rejected) {
    const first = plan.rejections[0];
    return `REJECT ${first.code}: ${first.detail}`;
  }
  return `OK ${plan.action.id} amount=${formatEth(BigInt(plan.args.amount ?? "0"))} ETH spend=${formatEth(plan.spend)} minOut=${plan.minOut}`;
}

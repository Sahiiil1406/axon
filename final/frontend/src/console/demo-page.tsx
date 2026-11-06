import { useState } from "react"
import {
  ArrowRight,
  ShieldCheck,
  Code2,
  Fingerprint,
  Globe,
  LockKeyhole,
  UserRound,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConsole } from "./model"
import { validateAmount } from "./api"
import {
  Badge,
  ChainLink,
  ConsoleLink,
  DefinitionList,
  Empty,
  PageHeading,
  Panel,
  Stat,
} from "./components"
import {
  delta,
  eth,
  failureReason,
  integer,
  receiptId,
  resultStatus,
  short,
} from "./format"
import { HistoryTable, Receipt } from "./transactions"
import type { CallResult, FunctionId, Lane } from "./types"

function LaneCard({
  lane,
  result,
  agent,
}: {
  lane: Lane
  result?: CallResult
  agent?: string | null
}) {
  const status = resultStatus(result)
  const Icon = lane === "human" ? UserRound : Fingerprint
  return (
    <article className={`console-lane ${lane}`}>
      <header>
        <span>
          <Icon size={16} />
          {lane === "human" ? "Human lane" : "Agent lane"}
          {agent && <span className="console-lane-agent">· {agent}</span>}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <p className="console-lane-function">
        {result?.signature ?? "Awaiting a call"}
      </p>
      <div className="console-delta">
        <strong>
          {result
            ? delta(result, lane === "human" ? "humanCount" : "agentCount")
            : "—"}
        </strong>
        <span>counter delta</span>
      </div>
      <DefinitionList
        rows={[
          ["Transaction", <ChainLink value={result?.hash} type="tx" />],
          ["Block", result?.blockNumber ?? "—"],
          ["Gas used", integer(result?.gasUsed)],
          [
            "Value paid",
            result?.valueEth != null
              ? `${result.ok ? result.valueEth : "0"} ETH`
              : "—",
          ],
          ["Caller", <ChainLink value={result?.caller} />],
          ...(lane === "agent"
            ? ([
                [
                  "Frames",
                  result?.frames ?? result?.simulation?.frames?.length ?? "—",
                ],
                ["Admission", result?.admission?.outcome ?? "Not available"],
                ["Frame results", result?.admission?.frameStatuses?.join(" → ") ?? "—"],
              ] as [string, React.ReactNode][])
            : []),
        ]}
      />
      <div
        className={`console-lane-note ${result ? (result.ok ? "good" : "bad") : ""}`}
      >
        {result
          ? result.ok
            ? lane === "human"
              ? "EOA caller · ordinary transaction"
              : "Registered account · VERIFY + SENDER"
            : failureReason(result)
          : lane === "human"
            ? "An ordinary EOA transaction from the owner key."
            : "A frame transaction signed with the agent key."}
      </div>
      {result && (
        <ConsoleLink
          className="console-text-link"
          href={`/app/transactions/${encodeURIComponent(receiptId(result))}`}
        >
          Inspect result <ArrowRight size={13} />
        </ConsoleLink>
      )}
    </article>
  )
}
export function DemoPage() {
  const {
    state,
    loading,
    error,
    busy,
    call,
    last,
    ens,
    callRestrictions,
    setCallRestriction,
  } = useConsole()
  const [selected, setSelected] = useState<FunctionId>("increment")
  const [amount, setAmount] = useState("0.05")
  const [validation, setValidation] = useState<string | null>(null)
  const [agentName, setAgentName] = useState<string | null>(null)
  const fn =
    state?.functions.find((f) => f.id === selected) ?? state?.functions[0]
  const disabled = !state || loading || !!error || !!busy
  async function run(lane: Lane) {
    if (!fn) return

    // Agent call restrictions
    if (lane === "agent") {
      if (!callRestrictions.agentEnabled) {
        setValidation("Agent calls are disabled by restriction toggle.")
        return
      }
      if (!callRestrictions.allowedFunctions[fn.id]) {
        setValidation(`${fn.signature} is not allowed for agent calls.`)
        return
      }
      if (callRestrictions.maxSpendPerCall != null && fn.needsAmount) {
        const amountWei = BigInt(amount.trim()) * 10n ** 18n
        if (amountWei > callRestrictions.maxSpendPerCall) {
          setValidation(
            `Spend exceeds max per call (${eth(callRestrictions.maxSpendPerCall.toString())} ETH).`
          )
          return
        }
      }
    }

    const invalid = fn.needsAmount ? validateAmount(amount) : null
    setValidation(invalid)
    if (invalid) return
    await call(
      lane,
      fn.id,
      fn.needsAmount ? amount.trim() : null,
      agentName || undefined
    )
  }
  const same =
    last.human && last.agent && last.human.function === last.agent.function
  const latest = state?.history[0]
  const agentOptions = ens?.agents ?? state?.ens?.agents ?? []
  return (
    <>
      <PageHeading
        eyebrow="FinalCounter / Transaction console"
        title="Same call. Different authority."
        actions={
          <ConsoleLink className="console-outline-link" href="/app/permissions">
            <LockKeyhole size={14} /> Manage permissions{" "}
            <ArrowRight size={13} />
          </ConsoleLink>
        }
      >
        Call the same contract as a human or an agent. Compare the transaction,
        counters, value paid, and permission checks.
      </PageHeading>
      <div className="console-contract-strip">
        <span>
          <Wallet size={14} /> Counter{" "}
          <ChainLink value={state?.contracts.counter} />
        </span>
        <span>
          <Fingerprint size={14} /> Agent account{" "}
          <ChainLink value={state?.contracts.agentAccount} />
        </span>
        <span>
          <LockKeyhole size={14} /> Grant{" "}
          <code title={state?.grant.grantHash}>
            {short(state?.grant.grantHash, 8, 6)}
          </code>
        </span>
        {agentName && (
          <span>
            <Globe size={14} /> ENS agent: <strong>{agentName}</strong>
          </span>
        )}
      </div>
      {agentOptions.length > 0 && (
        <div className="console-agent-selector">
          <label htmlFor="demo-agent-selector">Call as ENS agent</label>
          <select
            id="demo-agent-selector"
            value={agentName ?? ""}
            onChange={(e) => setAgentName(e.target.value || null)}
            disabled={disabled}
          >
            <option value="">Default agent account</option>
            {agentOptions.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} ({a.active ? "active" : "revoked"})
              </option>
            ))}
          </select>
          <p className="console-help">
            Selecting an ENS agent resolves its subdomain and uses its
            Permissioned Resolver text records for the call.
          </p>
        </div>
      )}


      <dl className="console-stats">
        <Stat
          label="Human count"
          value={state ? integer(state.counter.humanCount) : "—"}
          sub={
            state
              ? `${eth(state.counter.humanPaid)} ETH paid`
              : "Awaiting state"
          }
        />
        <Stat
          label="Agent count"
          value={state ? integer(state.counter.agentCount) : "—"}
          sub={
            state
              ? `${eth(state.counter.agentPaid)} ETH paid`
              : "Awaiting state"
          }
          tone="good"
        />
        <Stat
          label="Grant remaining"
          value={state ? `${state.grant.remainingEth} ETH` : "—"}
          sub={
            state
              ? `of ${state.grant.budgetEth} ETH per epoch`
              : "Awaiting grant"
          }
        />
        <Stat
          label="Agent balance"
          value={state ? `${state.agentBalanceEth} ETH` : "—"}
          sub={
            state
              ? `Next intent nonce ${state.intentNonce}`
              : "Awaiting account"
          }
        />
      </dl>
      <div className="console-call-setup-grid">
      <Panel
        className="console-rules-accent"
        eyebrow="00 / Call restrictions"
        title="Agent call rules"
        icon={<ShieldCheck size={22}/>}
        action={
          <Badge tone={callRestrictions.agentEnabled ? "good" : "bad"}>
            {callRestrictions.agentEnabled ? "Agent enabled" : "Agent disabled"}
          </Badge>
        }
      >
        <div className="console-restrictions">
          <label className="console-toggle-row console-agent-enable">
            <input
              type="checkbox"
              checked={callRestrictions.agentEnabled}
              onChange={(e) =>
                setCallRestriction("agentEnabled", e.target.checked)
              }
              disabled={disabled}
            />
            <span>Enable agent lane</span>
          </label>
          <fieldset className="console-function-toggles">
            <legend className="console-toggle-label">Allowed functions</legend>
            <div className="console-function-options">
            {state?.functions.map((f) => (
              <label key={f.id} className="console-toggle-row">
                <input
                  type="checkbox"
                  checked={callRestrictions.allowedFunctions[f.id]}
                  onChange={(e) =>
                    setCallRestriction("allowedFunctions", {
                      ...callRestrictions.allowedFunctions,
                      [f.id]: e.target.checked,
                    })
                  }
                  disabled={disabled || !callRestrictions.agentEnabled}
                />
                <span>{f.signature}</span>
              </label>
            ))}
          </div>
          </fieldset>
          <label className="console-spend-limit">
            <span>Max spend per call (ETH)</span>
            <input
              type="text"
              value={
                callRestrictions.maxSpendPerCall == null
                  ? ""
                  : eth(callRestrictions.maxSpendPerCall.toString())
              }
              onChange={(e) => {
                const v = e.target.value.trim()
                if (!v) {
                  setCallRestriction("maxSpendPerCall", null)
                } else {
                  const n = BigInt(v) * 10n ** 18n
                  setCallRestriction("maxSpendPerCall", n)
                }
              }}
              disabled={disabled || !callRestrictions.agentEnabled}
              inputMode="decimal"
              placeholder="No per-call limit"
            />
          </label>
        </div>
      </Panel>
        <Panel
          className="console-execute-accent"
          eyebrow="01 / Execute"
          title="Build a call"
          icon={<Code2 size={22}/>}
          action={
            <Badge tone={busy ? "warn" : "muted"}>
              {busy
                ? "Submitting"
                : loading
                  ? "Loading"
                  : !state || error
                    ? "Offline"
                    : "Ready"}
            </Badge>
          }
        >
          <form className="console-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Contract
              <select disabled>
                <option>FinalCounter</option>
              </select>
            </label>
            <label htmlFor="console-function">
              Function
              <select
                id="console-function"
                disabled={disabled || !fn}
                value={fn?.id ?? ""}
                onChange={(e) => {
                  setSelected(e.target.value as FunctionId)
                  setValidation(null)
                }}
              >
                {!fn && (
                  <option value="">
                    {loading
                      ? "Loading functions…"
                      : "Connect to load functions"}
                  </option>
                )}
                {state?.functions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.signature}
                  </option>
                ))}
              </select>
            </label>
            {fn?.needsAmount && (
              <>
                <label htmlFor="console-amount">
                  Amount (ETH)
                  <input
                    id="console-amount"
                    value={amount}
                    inputMode="decimal"
                    placeholder="0.05"
                    disabled={disabled}
                    aria-invalid={!!validation}
                    aria-describedby={
                      validation ? "call-validation" : undefined
                    }
                    onChange={(e) => {
                      setAmount(e.target.value)
                      setValidation(null)
                    }}
                  />
                </label>
                <div className="console-presets">
                  <span>Quick amount</span>
                  {["0.001", "0.01", "0.05", "0.5"].map((value) => (
                    <button
                      disabled={disabled}
                      type="button"
                      key={value}
                      onClick={() => {
                        setAmount(value)
                        setValidation(null)
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </>
            )}
            {validation && (
              <p
                className="console-inline-error"
                id="call-validation"
                role="alert"
              >
                {validation}
              </p>
            )}
            <p className="console-help">
              {fn?.note ??
                "Functions and current prices load from the demo API."}
              {fn?.id === "pay" && state && (
                <>
                  <br />
                  Current price: human{" "}
                  {state.counter.humanPriceEth ??
                    eth(state.counter.humanPrice)}{" "}
                  ETH · agent{" "}
                  {state.counter.agentPriceEth ?? eth(state.counter.agentPrice)}{" "}
                  ETH.
                </>
              )}
            </p>
            <div className="console-call-buttons">
              <Button
                disabled={disabled || !fn}
                aria-busy={busy === "human call"}
                onClick={() => void run("human")}
              >
                <UserRound size={18} />
                <span>
                  <strong>humanCall</strong>
                  <small>Ordinary EOA transaction</small>
                </span>
                <ArrowRight size={15} />
              </Button>
              <Button
                disabled={disabled || !fn}
                aria-busy={busy === "agent call"}
                onClick={() => void run("agent")}
              >
                <Fingerprint size={18} />
                <span>
                  <strong>agentCall</strong>
                  <small>VERIFY + SENDER frames</small>
                </span>
                <ArrowRight size={15} />
              </Button>
            </div>
            <p className="console-help console-form-foot">
              Calls are signed by the demo server. No wallet connection is
              required.
            </p>
          </form>
        </Panel>
      </div>
        <Panel
          eyebrow="02 / Compare"
          title="What the chain saw"
          action={
            <Badge tone={last.human && last.agent ? "good" : "muted"}>
              {last.human && last.agent
                ? "Both lanes"
                : last.human || last.agent
                  ? "One lane"
                  : "Waiting"}
            </Badge>
          }
        >
          <div className="console-lanes">
            <LaneCard lane="human" result={last.human} />
            <LaneCard lane="agent" result={last.agent} agent={agentName} />
          </div>
          <div className="console-compare-foot">
            {last.human && last.agent ? (
              <>
                <span>
                  {same ? "Same selector" : "Different selectors"} ·{" "}
                  {last.human.signature} / {last.agent.signature}
                </span>
                <span>
                  Gas: {integer(last.human.gasUsed)} /{" "}
                  {integer(last.agent.gasUsed)} · Frames:{" "}
                  {last.human.hash ? "1" : "—"} / {last.agent.frames ?? "—"}
                </span>
              </>
            ) : (
              <span>Run both lanes to compare their results side by side.</span>
            )}
          </div>
        </Panel>
      <Panel
        eyebrow="03 / Inspect"
        title="Latest receipt"
        action={
          latest && (
            <ConsoleLink
              className="console-text-link"
              href={`/app/transactions/${encodeURIComponent(receiptId(latest))}`}
            >
              Open details <ArrowRight size={13} />
            </ConsoleLink>
          )
        }
      >
        {latest ? (
          <Receipt result={latest} compact />
        ) : (
          <Empty title="No transaction result yet">
            Submit a call to inspect its receipt, simulation, and admission
            checks.
          </Empty>
        )}
      </Panel>
      <Panel
        eyebrow="04 / Activity"
        title="Recent calls"
        action={
          <ConsoleLink className="console-text-link" href="/app/activity">
            View all activity <ArrowRight size={13} />
          </ConsoleLink>
        }
      >
        <HistoryTable results={state?.history.slice(0, 5) ?? []} />
      </Panel>
    </>
  )
}

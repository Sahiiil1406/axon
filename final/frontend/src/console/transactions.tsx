import { useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Search,
  ShieldAlert,
  X,
} from "lucide-react"
import { useConsole } from "./model"
import {
  Badge,
  ChainLink,
  ConsoleLink,
  CopyButton,
  DefinitionList,
  Empty,
  PageHeading,
  Panel,
  RefreshButton,
} from "./components"
import {
  delta,
  failureReason,
  integer,
  receiptId,
  resultStatus,
  time,
} from "./format"
import type { CallResult } from "./types"

export function HistoryTable({ results }: { results: CallResult[] }) {
  return results.length ? (
    <div className="console-table-wrap">
      <table className="console-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Lane</th>
            <th>Function</th>
            <th>Status</th>
            <th>Counter Δ</th>
            <th>Transaction</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => {
            const status = resultStatus(result)
            return (
              <tr key={`${result.hash ?? result.at ?? index}-${index}`}>
                <td>{time(result.at)}</td>
                <td>
                  <Badge tone={result.lane === "agent" ? "good" : "muted"}>
                    {result.lane}
                  </Badge>
                </td>
                <td>
                  <code>{result.signature ?? result.function}</code>
                </td>
                <td>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td>
                  {delta(
                    result,
                    result.lane === "human" ? "humanCount" : "agentCount"
                  )}
                </td>
                <td>
                  <ChainLink value={result.hash} type="tx" />
                </td>
                <td>
                  <ConsoleLink
                    className="console-text-link"
                    aria-label={`Inspect ${result.lane} ${result.signature ?? result.function} at ${time(result.at)}`}
                    href={`/app/transactions/${encodeURIComponent(receiptId(result, index))}`}
                  >
                    Inspect <ArrowRight size={12} />
                  </ConsoleLink>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No matching calls">
      Calls from this server session will appear here.
    </Empty>
  )
}
export function Receipt({
  result,
  compact = false,
}: {
  result: CallResult
  compact?: boolean
}) {
  const status = resultStatus(result)
  return (
    <div className="console-receipt">
      <div className="console-receipt-heading">
        <div>
          <span className="console-eyebrow">
            {result.lane.toUpperCase()} / {result.signature ?? result.function}
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {result.hash && (
          <CopyButton value={result.hash} label="Copy transaction hash" />
        )}
      </div>
      {!result.ok && (
        <div className="console-result-error" role="status">
          <ShieldAlert size={17} />
          <span>{failureReason(result)}</span>
        </div>
      )}
      <div className="console-receipt-grid">
        <div>
          <h3>Transaction receipt</h3>
          <DefinitionList
            rows={[
              ["Transaction hash", <ChainLink value={result.hash} type="tx" />],
              ["Status", result.status ?? status.label],
              ["Block", result.blockNumber ?? "—"],
              ["Gas used", integer(result.gasUsed)],
              [
                "Value",
                result.valueEth != null ? `${result.valueEth} ETH` : "—",
              ],
              ["Caller", <ChainLink value={result.caller} />],
              [
                "Human count",
                `${result.before?.humanCount ?? "—"} → ${result.after?.humanCount ?? "—"}`,
              ],
              [
                "Agent count",
                `${result.before?.agentCount ?? "—"} → ${result.after?.agentCount ?? "—"}`,
              ],
              ...(result.lane === "agent"
                ? ([
                    [
                      "Intent spend",
                      result.spendEth != null ? `${result.spendEth} ETH` : "—",
                    ],
                  ] as [string, React.ReactNode][])
                : []),
            ]}
          />
        </div>
        <div>
          <h3>
            {result.lane === "agent"
              ? "Frame transaction"
              : "Ordinary transaction"}
          </h3>
          {result.lane === "human" ? (
            <>
              <DefinitionList
                rows={[
                  ["Path", "EOA → FinalCounter"],
                  [
                    "Frames",
                    result.hash ? "1 (ordinary call)" : "Not submitted",
                  ],
                  ["Counter delta", delta(result, "humanCount")],
                ]}
              />
              <p className="console-help">
                The contract classifies the caller through the registry. An
                unregistered EOA uses the human lane.
              </p>
            </>
          ) : (
            <>
              <DefinitionList
                rows={[
                  [
                    "Frames",
                    result.frames ??
                      result.simulation?.frames?.length ??
                      "Not available",
                  ],
                  [
                    "Execution simulation",
                    result.simulation?.executionStatus ?? "Not available",
                  ],
                  [
                    "Execution error",
                    result.simulation?.executionError ?? "None reported",
                  ],
                  [
                    "Canonical probe",
                    result.simulation
                      ? result.simulation.canonicalMempoolValid
                        ? "Valid"
                        : `Advisory: ${result.simulation.canonicalMempoolViolation ?? "invalid"}`
                      : "Not available",
                  ],
                  [
                    "Sidecar admission",
                    result.admission?.outcome ?? "Not available",
                  ],
                  [
                    "Preflight",
                    result.preflight
                      ? result.preflight.ok
                        ? "Passed"
                        : (result.preflight.code ?? "Blocked")
                      : "Not available",
                  ],
                ]}
              />
              {!!result.simulation?.frames?.length && (
                <ol className="console-frame-list">
                  {result.simulation.frames.map((frame, i) => (
                    <li key={i}>
                      <span>FRAME {i}</span>
                      <strong>
                        {i === 0 ? "VERIFY" : i === 1 ? "SENDER" : `FRAME ${i}`}
                      </strong>
                      <small>{integer(frame.gasUsed)} gas</small>
                      <Badge tone={frame.succeeded ? "good" : "bad"}>
                        {frame.succeeded ? "Pass" : "Fail"}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
              {result.simulation?.canonicalMempoolValid === false && (
                <p className="console-help">
                  The canonical probe is advisory for this alt-mempool flow.
                  Inspect the sidecar admission and receipt status for the
                  actual outcome.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {result.preflight?.ok === false && (
        <div className="console-preflight">
          <h3>
            <ShieldAlert size={16} /> Preflight ·{" "}
            {result.preflight.code ?? "Blocked"}
          </h3>
          <p>{result.preflight.message}</p>
          {result.preflight.code === "E_EPOCH_BUDGET" && (
            <DefinitionList
              rows={[
                ["Epoch budget", `${result.preflight.budgetEth ?? "—"} ETH`],
                ["Spent", `${result.preflight.spentEth ?? "—"} ETH`],
                ["Remaining", `${result.preflight.remainingEth ?? "—"} ETH`],
                ["Intent spend", `${result.preflight.spendEth ?? "—"} ETH`],
              ]}
            />
          )}
          <ConsoleLink className="console-text-link" href="/app/permissions">
            Review the grant <ArrowRight size={13} />
          </ConsoleLink>
        </div>
      )}
      {!!result.admission?.checks?.length && (
        <div className="console-admission">
          <h3>
            ERC-8421 admission checks{" "}
            <Badge tone={result.admission.failed ? "bad" : "good"}>
              {result.admission.outcome}
            </Badge>
          </h3>
          <ul>
            {(compact
              ? result.admission.checks.slice(0, 5)
              : result.admission.checks
            ).map((check, i) => (
              <li key={i}>
                {check.verdict === "pass" ? (
                  <Check size={14} />
                ) : check.verdict === "skip" ? (
                  <span>—</span>
                ) : (
                  <X size={14} />
                )}
                <div>
                  <strong>{check.rule}</strong>
                  {check.reason && <p>{check.reason}</p>}
                </div>
                {check.frameIndex != null && (
                  <small>FRAME {check.frameIndex}</small>
                )}
                <Badge
                  tone={
                    check.verdict === "pass"
                      ? "good"
                      : check.verdict === "skip"
                        ? "muted"
                        : "bad"
                  }
                >
                  {check.verdict}
                </Badge>
              </li>
            ))}
          </ul>
          {compact && result.admission.checks.length > 5 && (
            <p className="console-help">
              Open the full receipt to inspect all{" "}
              {result.admission.checks.length} checks.
            </p>
          )}
        </div>
      )}
      <details className="console-raw">
        <summary>Raw server result</summary>
        <div className="console-raw-actions">
          <CopyButton
            value={JSON.stringify(result, null, 2)}
            label="Copy raw server result"
          />
        </div>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}
export function ActivityPage() {
  const { state } = useConsole()
  const [lane, setLane] = useState("all")
  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const history = state?.history
  const filtered = useMemo(
    () =>
      (history ?? []).filter(
        (r) =>
          (lane === "all" || r.lane === lane) &&
          (status === "all" || (status === "success" ? r.ok : !r.ok)) &&
          `${r.hash ?? ""} ${r.signature ?? r.function} ${r.error ?? ""} ${r.preflight?.code ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [history, lane, status, search]
  )
  return (
    <>
      <PageHeading
        eyebrow="Workspace / Activity"
        title="Every call, in context."
        actions={<RefreshButton />}
      >
        Inspect the latest calls in the demo server’s session. Filter by lane,
        outcome, or transaction hash.
      </PageHeading>
      <Panel
        title="Transaction activity"
        eyebrow="Call history"
        action={<Badge>{filtered.length} results</Badge>}
      >
        <div className="console-filters">
          <label className="console-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hash, function, or error"
              aria-label="Search activity"
            />
          </label>
          <label>
            <span className="sr-only">Filter by lane</span>
            <select
              aria-label="Filter by lane"
              value={lane}
              onChange={(e) => setLane(e.target.value)}
            >
              <option value="all">All lanes</option>
              <option value="human">Human</option>
              <option value="agent">Agent</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by outcome</span>
            <select
              aria-label="Filter by outcome"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All outcomes</option>
              <option value="success">Succeeded</option>
              <option value="failed">Failed / blocked</option>
            </select>
          </label>
          <button
            type="button"
            className="console-export"
            disabled={!history?.length}
            onClick={() => {
              const blob = new Blob([JSON.stringify(history, null, 2)], {
                type: "application/json",
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = "axon-call-history.json"
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            <Download size={14} /> Export JSON
          </button>
        </div>
        <HistoryTable results={filtered} />
      </Panel>
      <p className="console-help console-session-note">
        The API retains the most recent 20 calls per server session. Owner
        permission transactions are shown on the permissions page.
      </p>
    </>
  )
}
export function TransactionPage({ id }: { id: string }) {
  const { state, loading } = useConsole()
  const result = state?.history.find((r, i) => receiptId(r, i) === id)
  return (
    <>
      <ConsoleLink
        href="/app/activity"
        className="console-text-link console-back-link"
      >
        <ArrowLeft size={13} /> Back to activity
      </ConsoleLink>
      <PageHeading
        eyebrow="Activity / Transaction"
        title="Inspect the execution."
      >
        A receipt, account state changes, frame simulation, and admission checks
        from the demo API.
      </PageHeading>
      <Panel
        eyebrow="Transaction result"
        title={result?.signature ?? "Transaction details"}
        action={
          result?.hash && (
            <ChainLink value={result.hash} type="tx" label="Open explorer" />
          )
        }
      >
        {result ? (
          <Receipt result={result} />
        ) : (
          <Empty
            title={
              loading
                ? "Loading transaction…"
                : "Transaction not in this session"
            }
          >
            Refresh the state or return to activity. Older receipts may have
            left the server’s 20-call history.
          </Empty>
        )}
      </Panel>
      <ConsoleLink className="console-outline-link" href="/app">
        Return to overview <ExternalLink size={13} />
      </ConsoleLink>
    </>
  )
}

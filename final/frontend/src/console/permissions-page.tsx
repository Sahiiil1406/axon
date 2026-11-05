import { useEffect, useRef, useState } from "react"
import { ArrowRight, Check, KeyRound, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConsole } from "./model"
import { validateBudget } from "./api"
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
  Stat,
} from "./components"
import { duration, expiry, short } from "./format"
import type { FunctionId } from "./types"

function RevokeDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) {
      ref.current?.showModal()
    } else {
      ref.current?.close()
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      className="console-revoke-dialog"
      aria-labelledby="revoke-title"
      onCancel={onClose}
    >
      <div className="console-dialog-icon">
        <ShieldOff size={25} />
      </div>
      <p className="console-eyebrow">LIVE PERMISSION REGISTRY</p>
      <h2 id="revoke-title">Revoke the agent grant?</h2>
      <p>
        The server will submit an owner transaction to deactivate this grant.
        Agent calls will be rejected until you save a new grant.
      </p>
      <div>
        <Button variant="outline" onClick={onClose}>
          Keep grant
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Revoke grant
        </Button>
      </div>
    </dialog>
  )
}
export function PermissionsPage() {
  const {
    state,
    loading,
    error,
    busy,
    refresh,
    permission,
    ownerTransactions,
  } = useConsole()
  const [budget, setBudget] = useState("")
  const [allow, setAllow] = useState<Record<FunctionId, boolean>>({
    increment: false,
    pay: false,
    payAmount: false,
  })
  const [dirty, setDirty] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  useEffect(() => {
    if (state && !dirty) {
      setBudget(state.grant.budgetEth)
      setAllow({ ...state.allowlist })
      setInvalid(null)
    }
  }, [state, dirty])
  const disabled = !state || loading || !!error || !!busy
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const message = validateBudget(budget)
    setInvalid(message)
    if (message) return
    if (await permission({ budgetEth: budget.trim(), allow })) setDirty(false)
  }
  async function reload() {
    setDirty(false)
    await refresh()
  }
  const grant = state?.grant
  return (
    <>
      <PageHeading
        eyebrow="PERMISSIONREGISTRY / OWNER CONTROLS"
        title="Define the agent’s authority."
        actions={
          <RefreshButton label="Reload grant" onClick={() => void reload()} />
        }
      >
        Set the spending budget and callable selectors. Changes are submitted by
        the demo server’s owner key and read live by the agent account.
      </PageHeading>
      <div className="console-permission-grid">
        <Panel
          eyebrow="01 / CURRENT GRANT"
          title="Onchain authority"
          action={
            <Badge tone={grant ? (grant.active ? "good" : "bad") : "muted"}>
              {grant
                ? grant.active
                  ? "Active"
                  : "Revoked"
                : loading
                  ? "Loading"
                  : "Unavailable"}
            </Badge>
          }
        >
          <dl className="console-grant-stats">
            <Stat
              label="Budget / epoch"
              value={grant ? `${grant.budgetEth} ETH` : "—"}
            />
            <Stat
              label="Spent this epoch"
              value={grant ? `${grant.spentEth} ETH` : "—"}
            />
            <Stat
              label="Remaining"
              value={grant ? `${grant.remainingEth} ETH` : "—"}
              tone="good"
            />
            <Stat
              label="Epoch length"
              value={duration(grant?.epochLengthSec)}
            />
          </dl>
          <div className="console-grant-details">
            <DefinitionList
              rows={[
                [
                  "Agent account",
                  <ChainLink value={state?.contracts.agentAccount} />,
                ],
                ["Agent key", <ChainLink value={grant?.agentKey} />],
                ["Owner", <ChainLink value={grant?.owner} />],
                ["Registry", <ChainLink value={state?.contracts.registry} />],
                [
                  "Grant hash",
                  grant ? (
                    <span className="console-copy-value">
                      <code title={grant.grantHash}>
                        {short(grant.grantHash, 10, 8)}
                      </code>
                      <CopyButton
                        value={grant.grantHash}
                        label="Copy grant hash"
                      />
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                ["Version", grant?.version ?? "—"],
                ["Expires", expiry(grant?.expiresAt)],
                [
                  "Key scheme",
                  grant?.keyScheme === 1
                    ? "1 · SECP256K1"
                    : grant?.keyScheme === 2
                      ? "2 · P256"
                      : (grant?.keyScheme ?? "—"),
                ],
              ]}
            />
          </div>
        </Panel>
        <Panel
          eyebrow="02 / EDIT AUTHORITY"
          title={
            grant && !grant.active
              ? "Regrant agent access"
              : "Update permission"
          }
          action={
            <Badge tone={dirty ? "warn" : "muted"}>
              {dirty ? "Unsaved changes" : state ? "In sync" : "Awaiting state"}
            </Badge>
          }
        >
          <form className="console-form" onSubmit={(e) => void save(e)}>
            <label htmlFor="permission-budget">
              Budget per epoch (ETH)
              <input
                id="permission-budget"
                value={budget}
                disabled={disabled}
                inputMode="decimal"
                placeholder="0.05"
                maxLength={80}
                aria-invalid={!!invalid}
                aria-describedby={invalid ? "permission-validation" : undefined}
                onChange={(e) => {
                  setBudget(e.target.value)
                  setDirty(true)
                  setInvalid(null)
                }}
              />
            </label>
            <div className="console-presets">
              <span>Quick budget</span>
              {["0.001", "0.01", "0.05", "0.5", "1"].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setBudget(value)
                    setDirty(true)
                    setInvalid(null)
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            {invalid && (
              <p
                className="console-inline-error"
                id="permission-validation"
                role="alert"
              >
                {invalid}
              </p>
            )}
            <fieldset className="console-selectors" disabled={disabled}>
              <legend>Allowlisted selectors</legend>
              {state?.functions.map((fn) => (
                <label key={fn.id}>
                  <div>
                    <strong>{fn.signature}</strong>
                    <small>
                      {fn.selector} · {fn.note}
                    </small>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`Allow ${fn.signature}`}
                    checked={!!allow[fn.id]}
                    onChange={(e) => {
                      setAllow((prev) => ({
                        ...prev,
                        [fn.id]: e.target.checked,
                      }))
                      setDirty(true)
                    }}
                  />
                </label>
              ))}
              {!state && (
                <p className="console-help">
                  Connect to the API to load the current allowlist.
                </p>
              )}
            </fieldset>
            <p className="console-help">
              {grant && !grant.active
                ? "The grant is revoked. Saving re-grants the existing agent key with the budget and selectors above."
                : "Saving submits grantAgent from the owner key, then updates any changed selector permissions."}
            </p>
            <div className="console-permission-actions">
              <Button
                type="submit"
                disabled={disabled}
                aria-busy={busy === "updating permissions"}
              >
                <Check size={14} />
                {grant && !grant.active ? "Save & regrant" : "Save permission"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || !dirty}
                onClick={() => {
                  setDirty(false)
                  setInvalid(null)
                }}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={disabled || !grant?.active}
                onClick={() => setRevokeOpen(true)}
              >
                <ShieldOff size={14} /> Revoke grant
              </Button>
            </div>
          </form>
        </Panel>
      </div>
      <Panel
        eyebrow="03 / DEMO WORKFLOW"
        title="Put the permission boundary to work"
      >
        <div className="console-walkthrough">
          <article>
            <span>01</span>
            <h3>Compare the two callers</h3>
            <p>
              Run increment() through humanCall and agentCall. The same contract
              advances the human counter by 1 and the agent counter by 10.
            </p>
            <ConsoleLink className="console-text-link" href="/app">
              Open call console <ArrowRight size={13} />
            </ConsoleLink>
          </article>
          <article>
            <span>02</span>
            <h3>Exercise the epoch budget</h3>
            <p>
              Set a budget below your intended spend, then submit
              payAmount(uint256) as the agent. Inspect E_EPOCH_BUDGET, raise the
              budget, and run the same call again.
            </p>
            <ConsoleLink className="console-text-link" href="/app/activity">
              Inspect the outcomes <ArrowRight size={13} />
            </ConsoleLink>
          </article>
          <article>
            <span>03</span>
            <h3>Change the authority</h3>
            <p>
              Disable a selector or revoke the grant. The next agent request
              reads the updated registry. Save a grant again to restore the
              delegated path.
            </p>
            <span className="console-help">
              <KeyRound size={13} /> Owner-defined, live authority
            </span>
          </article>
        </div>
      </Panel>
      <div className="console-permission-results">
        <Panel
          eyebrow="04 / OWNER TRANSACTIONS"
          title="Permission updates"
          action={<Badge>{ownerTransactions.length} transactions</Badge>}
        >
          {ownerTransactions.length ? (
            <ul className="console-owner-txs">
              {ownerTransactions.map((tx, i) => (
                <li key={`${tx.hash}-${i}`}>
                  <span>
                    <Check size={14} />
                    {tx.label}
                  </span>
                  <ChainLink value={tx.hash} type="tx" />
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No permission changes in this browser session">
              Confirmed owner transactions will appear here after a save or
              revocation.
            </Empty>
          )}
        </Panel>
        <Panel
          eyebrow="05 / RESULTING STATE"
          title="Authority after the update"
        >
          <div className="console-grant-details">
            <DefinitionList
              rows={[
                ["Budget", grant ? `${grant.budgetEth} ETH` : "—"],
                ["Spent", grant ? `${grant.spentEth} ETH` : "—"],
                ["Remaining", grant ? `${grant.remainingEth} ETH` : "—"],
                [
                  "Active",
                  grant ? (
                    <Badge tone={grant.active ? "good" : "bad"}>
                      {grant.active ? "Yes" : "No"}
                    </Badge>
                  ) : (
                    "—"
                  ),
                ],
                ...(state?.functions ?? []).map(
                  (fn) =>
                    [
                      fn.signature,
                      <Badge tone={state?.allowlist[fn.id] ? "good" : "bad"}>
                        {state?.allowlist[fn.id] ? "Allowed" : "Denied"}
                      </Badge>,
                    ] as [string, React.ReactNode]
                ),
              ]}
            />
          </div>
        </Panel>
      </div>
      <RevokeDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => {
          setRevokeOpen(false)
          void permission({ active: false })
        }}
      />
    </>
  )
}

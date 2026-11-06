import { useEffect, useRef, useState } from "react"
import { ArrowRight, Check, KeyRound, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConsole } from "./model"
import { runZkProofDemo, validateBudget } from "./api"
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
import { duration, eth, expiry, short } from "./format"
import type { FunctionId } from "./types"

function RevokeDialog({
  open,
  onClose,
  onConfirm,
  targetLabel,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  targetLabel: string
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
      <p className="console-eyebrow">Live permission registry</p>
      <h2 id="revoke-title">Revoke {targetLabel}?</h2>
      <p>
        Deactivating this grant sets its authority to inactive. Agent calls will
        be rejected until you save a new grant.
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
    ens,
    ownerTransactions,
    worldIdStatus,
    worldIdSkipped,
    skipWorldId,
  } = useConsole()
  const [proofDemo, setProofDemo] = useState<Awaited<ReturnType<typeof runZkProofDemo>>>()
  const [proofDemoBusy, setProofDemoBusy] = useState(false)
  const [proofDemoError, setProofDemoError] = useState<string>()

  async function runProofDemo() {
    setProofDemoBusy(true)
    setProofDemo(undefined)
    setProofDemoError(undefined)
    try {
      setProofDemo(await runZkProofDemo())
    } catch (error) {
      setProofDemoError(error instanceof Error ? error.message : "Proof demo failed.")
    } finally {
      setProofDemoBusy(false)
    }
  }

  const [budget, setBudget] = useState("")
  const [allow, setAllow] = useState<Record<FunctionId, boolean>>({
    increment: false,
    pay: false,
    payAmount: false,
  })
  const [dirty, setDirty] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState("")
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null) // null = default account

  const selectedAgentInfo = selectedAgent
    ? ens.agents.find((agent) => agent.name === selectedAgent) ?? null
    : null

  useEffect(() => {
    if (!state || dirty) return
    setBudget(selectedAgent ? eth(selectedAgentInfo?.budget) : state.grant.budgetEth)
    setAllow(selectedAgent ? {
      increment: false,
      pay: false,
      payAmount: false,
      ...Object.fromEntries(state.functions.map((fn) => [
        fn.id,
        selectedAgentInfo?.allowlist?.some((entry) =>
          entry.target.toLowerCase() === state.contracts.counter.toLowerCase() &&
          entry.selector.toLowerCase() === fn.selector.toLowerCase()
        ) ?? false,
      ])),
    } : { ...state.allowlist })
    setInvalid(null)
  }, [state, dirty, selectedAgent, selectedAgentInfo])

  const disabled = !state || loading || !!error || !!busy
  const needsSetup = !!selectedAgent && (!selectedAgentInfo || !!selectedAgentInfo.unresolved)
  const agentDisabled = disabled || needsSetup
  const scopedRoot = selectedAgent ? selectedAgentInfo?.scopedPolicyRoot : state?.scopedPolicyRoot
  const hasScopedPolicy = scopedRoot != null
  const scopedPolicyActive = hasScopedPolicy && scopedRoot !== "0"

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (agentDisabled) return
    const message = validateBudget(budget)
    setInvalid(message)
    if (message) return

    if (
      await permission({
        budgetEth: budget.trim(),
        allow,
        agentName: selectedAgent ?? undefined,
      })
    ) {
      setDirty(false)
    }
  }

  async function reload() {
    setDirty(false)
    await refresh()
  }

  const grant = selectedAgentInfo && !needsSetup
    ? {
        active: selectedAgentInfo.active,
        budgetEth: eth(selectedAgentInfo.budget),
        spentEth: "—",
        remainingEth: "—",
        agentKey: selectedAgentInfo.agentKey ?? "—",
        owner: state?.contracts.owner,
        version: selectedAgentInfo.version,
        grantHash: "—",
        expiresAt: "—",
        keyScheme: 1,
        epochLengthSec: 86400,
      }
    : selectedAgent ? undefined : state?.grant

  const grantRows: [string, React.ReactNode][] = [
    [
      "Agent account",
      <ChainLink value={selectedAgent ? selectedAgentInfo?.account : state?.contracts.agentAccount} />,
    ],
    ["Agent key", <ChainLink value={grant?.agentKey} />],
    ["Owner", <ChainLink value={grant?.owner} />],
    ["Registry", <ChainLink value={state?.contracts.registry} />],
    ...(selectedAgent && selectedAgentInfo
      ? [["ENS name", selectedAgentInfo.name] as [string, React.ReactNode]]
      : []),
    ...(selectedAgent && selectedAgentInfo
      ? []
      : ([
          [
            "Grant hash",
            grant ? (
              <span className="console-copy-value">
                <code title={grant.grantHash}>
                  {short(grant.grantHash, 10, 8)}
                </code>
                <CopyButton value={grant.grantHash} label="Copy grant hash" />
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
        ] satisfies [string, React.ReactNode][])),
  ];

  return (
    <>
      <PageHeading
        eyebrow="PermissionRegistry / owner controls"
        title="Define the agent's authority."
        actions={
          <RefreshButton label="Reload grant" onClick={() => void reload()} />
        }
      >
        Set the spending budget and callable selectors. Changes are submitted
        by the demo server's owner key and read live by the agent account.
        Sepolia resolves each agent name to its account. The devnet PermissionRegistry stores and enforces its grant.
      </PageHeading>

      {/* Agent selector */}
      <Panel eyebrow="00 / Select agent" title="Choose authority target">
        <div className="console-agent-selector">
          <label htmlFor="agent-selector">Authority target</label>
          <select
            id="agent-selector"
            value={selectedAgent ?? "default"}
            onChange={(e) => {
              setSelectedAgent(
                e.target.value === "default" ? null : e.target.value
              )
              setDirty(false)
            }}
            disabled={disabled}
          >
            <option value="default">Default account (devnet PermissionRegistry)</option>
            {ens.agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} ({a.unresolved ? "first-time setup" : a.active ? "active" : "revoked"})
              </option>
            ))}
          </select>
          {selectedAgent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedAgent(null)}
            >
              Use default
            </Button>
          )}
          {ens.agents.length === 0 && !state?.ens?.humanName && (
            <p className="console-help">
              No ENS human name configured. Create agents on the{" "}
              <ConsoleLink href="/app/agents">Agents page</ConsoleLink>.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        eyebrow="01 / CURRENT GRANT"
        title={
          selectedAgent ? `ENS agent: ${selectedAgent}` : "Onchain authority"
        }
        action={
          <Badge tone={grant ? (grant.active ? "good" : "bad") : "muted"}>
            {grant
              ? grant.active
                ? "Active"
                : "Revoked"
              : loading
                ? "Loading"
                : needsSetup ? "No onchain grant" : "Unavailable"}
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
          <Stat label="Epoch length" value={duration(grant?.epochLengthSec)} />
        </dl>
        <div className="console-grant-details">
          <DefinitionList
            rows={grantRows}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Private permissions"
        title="Scoped ZK policy"
        action={<Badge tone={scopedPolicyActive ? "good" : "muted"}>
          {scopedPolicyActive ? "Root committed" : hasScopedPolicy ? "No root set" : "No scoped policy detected"}
        </Badge>}
      >
        <p className="console-help">
          A scoped proof authorizes one exact call while keeping the rule’s limit and other rules private.
          The public epoch budget still applies.
        </p>
        {scopedPolicyActive && (
          <DefinitionList rows={[["Policy root", <span className="console-copy-value">
            <code title={scopedRoot}>{short(scopedRoot, 10, 8)}</code>
            <CopyButton value={scopedRoot} label="Copy policy root" />
          </span>]]} />
        )}
        <p className="console-help">
          {hasScopedPolicy
            ? "Use the Axon skill with the matching --scoped-view file. The SENDER frame verifies the proof."
            : "Deploy and configure a ScopedAgentAccount to use private proofs. Setup steps are in why zk.md."}
        </p>
        <div className="console-permission-actions">
          <Button type="button" variant="outline" disabled={proofDemoBusy} onClick={() => void runProofDemo()}>
            {proofDemoBusy ? "Generating and checking proof…" : "Run ZK proof demo"}
          </Button>
        </div>
        <p className="console-help">Local Groth16 check using a sample policy. No transaction is sent.</p>
        {proofDemoError && <p className="console-inline-error" role="alert">{proofDemoError}</p>}
        {proofDemo && (
          <div role="status">
            <DefinitionList rows={[
              ["Sample policy root", <span className="console-copy-value">
                <code title={proofDemo.root}>{short(proofDemo.root, 10, 8)}</code>
                <CopyButton value={proofDemo.root} label="Copy sample root" />
              </span>],
              [`Proof for ${proofDemo.amountWei} wei`, <Badge tone={proofDemo.verified ? "good" : "bad"}>{proofDemo.verified ? "Verified" : "Failed"}</Badge>],
              ["Same proof with a changed amount", <Badge tone={proofDemo.tamperedAmountRejected ? "good" : "bad"}>{proofDemo.tamperedAmountRejected ? "Rejected by verifier" : "Unexpectedly accepted"}</Badge>],
              ["Over-limit witness", <Badge tone={proofDemo.overLimitRejected ? "good" : "bad"}>{proofDemo.overLimitRejected ? "Rejected by circuit" : "Unexpectedly accepted"}</Badge>],
            ]} />
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="02 / EDIT AUTHORITY"
        title={
          needsSetup
            ? "Set up agent permissions"
            : grant && !grant.active
            ? "Regrant agent access"
            : selectedAgent
              ? `Update ${selectedAgent} permissions`
              : "Update permission"
        }
        action={
          <Badge tone={dirty ? "warn" : "muted"}>
            {dirty ? "Unsaved changes" : needsSetup ? "First-time setup" : state ? "In sync" : "Awaiting state"}
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
            <p className="console-inline-error" id="permission-validation" role="alert">
              {invalid}
            </p>
          )}
          {!hasScopedPolicy && (
          <fieldset className="console-selectors" disabled={agentDisabled}>
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
                    setInvalid(null)
                  }}
                />
              </label>
            ))}
            {selectedAgent && selectedAgentInfo && selectedAgentInfo.allowlist?.length > 0 && (
              <p className="console-help">
                Devnet allowlist: {selectedAgentInfo.allowlist.map((e) => `${e.selector} → ${e.target}`).join(", ")}
              </p>
            )}
          </fieldset>
          )}
          {selectedAgentInfo?.account && state?.contracts.agentAccount.toLowerCase() === selectedAgentInfo.account.toLowerCase() && (
            <p className="console-help">
              This ENS name uses the default devnet account. Changes also affect other names using that account.
            </p>
          )}
          <p className="console-help">
            {hasScopedPolicy
              ? "This form updates the public epoch budget. The committed root controls the private rules."
              : needsSetup
              ? "This name needs a valid Sepolia account binding and devnet grant before its permissions can be edited."
              : selectedAgent
              ? `Saving updates the devnet grant for ${selectedAgent}. World ID verification is required.`
              : grant && !grant.active
                ? "The grant is revoked. Saving re-grants the existing agent key with the budget and selectors above."
                : "Saving submits grantAgent from the owner key, then updates any changed selector permissions."}
          </p>
          <p className="console-help">Verify with World ID, then submit the permission change.</p>
          <div className="console-permission-actions">
            {state?.worldIdTestSkip && worldIdStatus !== "verified" && (
              <Button type="button" variant="outline" onClick={skipWorldId}
                disabled={agentDisabled || worldIdStatus === "verifying"}>
                Skip World ID for testing
              </Button>
            )}
            {worldIdSkipped && <Badge tone="warn">Skipped for testing</Badge>}
            <Button
              type="submit"
              disabled={agentDisabled || worldIdStatus === "verifying"}
              aria-busy={busy === "updating permissions"}
            >
              <Check size={14} />
              {worldIdStatus !== "verified"
                ? "Verify with World ID"
                : needsSetup ? "Account setup required" : grant && !grant.active ? "Save & regrant" : "Save permission"}
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
            {!needsSetup && <Button
              type="button"
              variant="destructive"
              disabled={agentDisabled || !grant?.active}
              onClick={() => {
                setRevokeTarget(selectedAgent ?? "default account")
                setRevokeOpen(true)
              }}
            >
              <ShieldOff size={14} /> Revoke grant
            </Button>}
          </div>
        </form>
      </Panel>

      <Panel
        eyebrow="03 / Demo workflow"
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
          {ens.humanName && (
            <article>
              <span>04</span>
              <h3>Manage ENS agents</h3>
              <p>
                Create agent subdomains under {ens.humanName}, each with its own
                Permissioned Resolver. World ID verification gates authority
                changes.
              </p>
              <ConsoleLink className="console-text-link" href="/app/agents">
                Open agent manager <ArrowRight size={13} />
              </ConsoleLink>
            </article>
          )}
        </div>
      </Panel>

      <div className="console-permission-results">
        <Panel
          eyebrow="04 / Owner transactions"
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
          eyebrow="05 / Resulting state"
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
          void permission({
            active: false,
            agentName: selectedAgent ?? undefined,
          })
        }}
        targetLabel={revokeTarget || "the agent grant"}
      />
    </>
  )
}

import { AuthorityCircuit } from "@/components/brand/authority-circuit"
import { SolidityCode } from "@/components/solidity-code"
import { ApplicationFlow } from "@/components/brand/application-flow"
import { AsciiSharks } from "@/components/ascii-sharks"
import { SiteLink } from "@/components/site-link"
import { lazy, Suspense, useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Fingerprint,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Layers3,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Terminal,
  Zap,
} from "lucide-react"
import type { KeyboardEvent, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  ActionLink,
  AxonMark,
  SectionHeading,
  TextLink,
} from "@/components/brand/primitives"
import {
  CornerMarkers,
  ReferenceFrame,
} from "@/components/brand/reference-frame"

const LandingShader = lazy(() => import("@/components/brand/landing-shader"))

function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  )
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
  if (current < 0) return
  event.preventDefault()
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
          tabs.length
  tabs[next]?.focus()
  tabs[next]?.click()
}

function Section({
  id,
  children,
  className = "",
  corners = false,
}: {
  id: string
  children: ReactNode
  className?: string
  corners?: boolean
}) {
  return (
    <section id={id} className={`axon-section ${className}`}>
      {corners && <CornerMarkers/>}
      <div className="container-shell">{children}</div>
    </section>
  )
}
function Separator({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <div className={`axon-separator${fullWidth ? " axon-separator-full" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}
function Hero() {
  return (
    <section className="axon-hero cornered" aria-labelledby="hero-title">
      <CornerMarkers />
      <div className="hero-art" aria-hidden="true">
        <AsciiSharks
          className="hero-sharks"
          overlayClassName="hero-sharks-tinted"
        />
      </div>
      <SiteLink href="/docs" className="axon-announcement">
        <span className="status-dot" /> Built for agentic Ethereum{" "}
        <span className="announcement-divider" /> Explore the protocol{" "}
        <ArrowUpRight size={13} />
      </SiteLink>
      <h1 id="hero-title">
        Let agents act.
        <br />
        Keep authority yours.
      </h1>
      <p>
        The permission and guardrail layer for agentic Web3.
        <br className="hidden sm:block" /> Scoped intent. Live permissions. An
        Ethereum alt mempool.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ActionLink href="/docs" variant="secondary">
          Check out docs <ArrowRight size={16} />
        </ActionLink>
        <SiteLink href="/app" className="hero-docs">
          View demo <ArrowUpRight size={16} />
        </SiteLink>
      </div>
      <div className="axon-hero-footer">
        <span>Agent autonomy · Owner authority</span>
        <span>Verify → Authorize → Execute</span>
      </div>
    </section>
  )
}

function Architecture() {
  return (
    <Section id="architecture">
      <SectionHeading
        eyebrow="One path. Explicit authority."
        title="A boundary for every action."
      >
        An agent can decide what to do. Axon defines what it is allowed to do,
        from a signed intent to onchain execution.
      </SectionHeading>
      <AuthorityCircuit />

    </Section>
  )
}

function AuthorityFeatures() {
  return <Section id="authority-features">
      <ReferenceFrame className="edge-grid">
        {[
          {
            icon: SlidersHorizontal,
            title: "Delegate precisely",
            body: "Set the target contracts, callable functions, spending budget, and expiry for each agent key.",
          },
          {
            icon: Radio,
            title: "Validate live authority",
            body: "Read the current permission registry during validation, so changes do not depend on a mirrored grant.",
          },
          {
            icon: ShieldCheck,
            title: "Enforce at execution",
            body: "Owner permissions and protocol rules both govern the action. The agent cannot waive either boundary.",
          },
        ].map((item) => (
          <article key={item.title}>
            <item.icon size={28} />
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </ReferenceFrame>
  </Section>
}


const boundaries = [
  {
    label: "Owner authority",
    icon: KeyRound,
    title: "Your keys. Your boundaries.",
    body: "The owner grants an agent key a defined budget and lifetime. Target contracts and function selectors are explicitly allowed. Updating the grant changes its hash, invalidating intents signed against the old authority.",
    code: [
      "grant.agentKey = agent",
      "grant.budgetPerEpoch = budget",
      "grant.expiresAt = expiry",
      "allowed[target][selector] = true",
    ],
    tag: "Permission registry",
  },
  {
    label: "Agent intent",
    icon: Fingerprint,
    title: "An action with a defined scope.",
    body: "The agent signs an intent that binds its action to the current grant. Nonce and deadline checks constrain replay and timing; the account checks the target, selector, and available epoch budget.",
    code: [
      "intent.grantHash == current.grantHash",
      "intent.nonce == account.intentNonce",
      "registry.isAllowed(target, selector)",
      "spent + intent.value <= budget",
    ],
    tag: "Agent account",
  },
  {
    label: "Protocol rules",
    icon: ShieldCheck,
    title: "The protocol keeps its own rules.",
    body: "A valid owner grant is only one side of the check. Agent-native protocols can independently enforce constraints such as destination, trade size, slippage, oracle freshness, and cooldown.",
    code: [
      "destination == account.owner",
      "amount <= MAX_TRADE",
      "slippage <= MAX_SLIPPAGE_BPS",
      "oracle.updatedAt() is fresh",
    ],
    tag: "Agent-native protocol",
  },
]
function Permissions() {
  const [selected, setSelected] = useState(0)
  const item = boundaries[selected]
  return (
    <Section id="permissions" className="cornered policy-outer-frame" corners>
      <SectionHeading
        eyebrow="Two-sided enforcement"
        title={<><ShieldCheck size={25} aria-hidden="true"/>Permission is a shared decision.</>}
      >
        Owner-defined authority meets protocol-defined rules. A single agent
        action must respect both.
      </SectionHeading>
      <div
        className="boundary-tabs policy-tabs"
        role="tablist"
        aria-label="Authority boundaries"
        onKeyDown={tabKeys}
      >
        {boundaries.map((b, i) => (
          <button
            key={b.label}
            id={`boundary-tab-${i}`}
            role="tab"
            aria-selected={selected === i}
            tabIndex={selected === i ? 0 : -1}
            aria-controls="boundary-panel"
            onClick={() => setSelected(i)}
          >
            <b.icon size={17} />
            {b.label}
          </button>
        ))}
      </div>
      <ReferenceFrame>
        <div
          className="boundary-panel"
          id="boundary-panel"
          role="tabpanel"
          aria-labelledby={`boundary-tab-${selected}`}
        >
          <div>
            <span className="eyebrow">{item.tag}</span>
            <h3>{item.title}</h3>
            <p className="body-copy">{item.body}</p>
            <TextLink href="/docs">Understand the model</TextLink>
          </div>
          <div className="policy-code cornered">
            <CornerMarkers />
            <div className="code-top">
              <span />
              <span />
              <span />
              <small>authority.check</small>
            </div>
            {item.code.map((line, i) => (
              <div key={line} className="code-line">
                <span className="line-number">0{i + 1}</span>
                <code>{line}</code>
                <Check size={14} />
              </div>
            ))}
            <div className="code-status">
              <span className="status-dot" /> Explicit checks. Bounded
              authority.
            </div>
          </div>
        </div>
      </ReferenceFrame>
      <div className="foundation-row">
        <span>
          <Code2 /> EIP-8141
        </span>
        <span>
          <Layers3 /> Alt mempool
        </span>
        <span>
          <KeyRound /> Live grants
        </span>
        <span>
          <GitBranch /> Scoped intents
        </span>
        <span>
          <ShieldCheck /> Guarded execution
        </span>
      </div>
    </Section>
  )
}
function Comparison() {
  return (
    <Section id="alt-mempool">
      <SectionHeading
        eyebrow="Why an alt mempool?"
        title="Live permissions need a different path."
      >
        Axon’s account reads the external registry during validation. That
        foreign storage read is outside this devnet’s public-mempool rules.
      </SectionHeading>
      <ReferenceFrame className="revocation-comparison">
        <div className="revocation-event">
          <span className="revocation-event-icon">
            <KeyRound size={19} />
          </span>
          <div>
            <span className="eyebrow">One owner decision</span>
            <h3>The owner revokes the grant.</h3>
          </div>
          <span className="revocation-event-badge">
            <ShieldX size={13} /> Registry updated
          </span>
        </div>
        <div className="revocation-options">
          <article className="revocation-option">
            <div className="revocation-option-heading">
              <span className="revocation-option-icon">
                <Layers3 size={21} />
              </span>
              <span>Mirrored authority</span>
            </div>
            <h3>The copy still says yes.</h3>
            <p>The registry changed. The account’s local snapshot did not.</p>
            <div className="revocation-snapshot">
              <div>
                <span>Live registry</span>
                <strong>Revoked</strong>
                <span className="revocation-version">New grant hash</span>
              </div>
              <div className="revocation-stale">
                <span>Account’s copy</span>
                <strong>Still active</strong>
                <span className="revocation-version">Previous grant hash</span>
              </div>
            </div>
            <div className="revocation-result">
              <RotateCcw size={17} />
              <div>
                <strong>Waiting for synchronization</strong>
                <p>
                  The owner must call <code>syncGrant()</code> before the
                  account observes the revocation.
                </p>
              </div>
            </div>
          </article>
          <article className="revocation-option revocation-live">
            <Suspense fallback={null}>
              <LandingShader variant="dithering" className="authority-shader" />
            </Suspense>
            <div className="revocation-option-heading">
              <AxonMark size={27} />
              <span>Live authority with Axon</span>
            </div>
            <h3>The next intent sees no.</h3>
            <p>The account reads the current registry during validation.</p>
            <div className="revocation-snapshot">
              <div>
                <span>Live registry</span>
                <strong>Revoked</strong>
                <span className="revocation-version">New grant hash</span>
              </div>
              <div className="revocation-fresh">
                <span>Account’s read</span>
                <strong>Current state</strong>
                <span className="revocation-version">Live grant hash</span>
              </div>
            </div>
            <div className="revocation-result">
              <ShieldCheck size={17} />
              <div>
                <strong>Old authority is rejected</strong>
                <p>
                  Intents signed against the previous grant fail the freshness
                  check. No mirror to synchronize.
                </p>
              </div>
            </div>
          </article>
        </div>
      </ReferenceFrame>
      <div className="comparison-caption">
        <span>Validation reads live authority.</span>
        <ArrowRight size={15} />
        <span>Execution checks time-dependent rules.</span>
        <ArrowRight size={15} />
        <span>Owners keep control.</span>
      </div>
    </Section>
  )
}

type GuardTab = "Budget" | "Scope" | "Revocation"
function Guardrails() {
  const [tab, setTab] = useState<GuardTab>("Budget")
  const [amount, setAmount] = useState("0.25")
  const [targetAllowed, setTargetAllowed] = useState(true)
  const [active, setActive] = useState(true)
  const [result, setResult] = useState<null | { ok: boolean; reason: string }>(
    null
  )
  function check() {
    const value = Number(amount)
    if (!active) setResult({ ok: false, reason: "E_GRANT_INACTIVE" })
    else if (!targetAllowed) setResult({ ok: false, reason: "E_TARGET_DENIED" })
    else if (!Number.isFinite(value) || value <= 0)
      setResult({ ok: false, reason: "Enter an amount greater than 0." })
    else if (value > 0.8) setResult({ ok: false, reason: "E_EPOCH_BUDGET" })
    else
      setResult({
        ok: true,
        reason: "Within owner policy. Ready for protocol checks.",
      })
  }
  return (
    <Section id="guardrails" className="cornered policy-outer-frame" corners>
      <SectionHeading
        eyebrow="Guardrails that are part of the transaction"
        title={<><SlidersHorizontal size={25} aria-hidden="true"/>Give autonomy a scope.</>}
      >
        Define the policy before the agent acts. Inspect how a change in
        authority changes the outcome.
      </SectionHeading>
      <div id="playground" className="playground-anchor" />
      <div
        className="tabs guard-tabs policy-tabs"
        role="tablist"
        aria-label="Guardrail types"
        onKeyDown={tabKeys}
      >
        {(["Budget", "Scope", "Revocation"] as GuardTab[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            id={`guard-tab-${name.toLowerCase()}`}
            aria-controls="guard-panel"
            onClick={() => {
              setTab(name)
              setResult(null)
            }}
          >
            {name === "Budget" ? (
              <SlidersHorizontal size={16} />
            ) : name === "Scope" ? (
              <KeyRound size={16} />
            ) : (
              <ShieldX size={16} />
            )}{" "}
            {name}
          </button>
        ))}
      </div>
      <ReferenceFrame className="guard-panel">
        <div
          className="guard-description"
          id="guard-panel"
          role="tabpanel"
          aria-labelledby={`guard-tab-${tab.toLowerCase()}`}
        >
          <span className="eyebrow">
            {tab === "Budget"
              ? "01 / Spending authority"
              : tab === "Scope"
                ? "02 / CONTRACT + FUNCTION"
                : "03 / Live grant state"}
          </span>
          <h3>
            {tab === "Budget"
              ? "Every epoch has a limit."
              : tab === "Scope"
                ? "Only the calls you allow."
                : "Revoke the grant. Close the path."}
          </h3>
          <p className="body-copy">
            {tab === "Budget"
              ? "Set a per-epoch spending budget. The account tracks value spent and checks that the next intent fits within the remaining authority."
              : tab === "Scope"
                ? "An agent’s permission is specific to a target contract and function selector. A signature alone does not authorize an arbitrary call."
                : "The live registry is the source of authority. Revocation deactivates the grant and changes its hash, invalidating intents tied to the old state."}
          </p>
          <TextLink
            href={`/docs#${tab === "Budget" ? "grants" : tab === "Scope" ? "scope" : "revocation"}`}
          >
            Explore the permission model
          </TextLink>
          <div className="guard-facts">
            <span>
              <Check size={14} /> Owner-defined
            </span>
            <span>
              <Check size={14} /> Checked onchain
            </span>
          </div>
        </div>
        <div className="guard-demo cornered">
          <CornerMarkers />
          <div className="demo-heading">
            <span>
              <Terminal size={15} /> Policy playground
            </span>
            <span className="eyebrow">Local simulation</span>
          </div>
          <div className="demo-account">
            <div className="account-icon">
              <Fingerprint size={23} />
            </div>
            <div>
              <strong>rebalance-agent</strong>
              <span>AgentAccount · illustrative intent</span>
            </div>
            <span className={`state-badge ${active ? "" : "inactive"}`}>
              {active ? "Active grant" : "Revoked"}
            </span>
          </div>
          <div className="budget-label">
            <span>Epoch budget</span>
            <span>0.20 / 1.00 ETH</span>
          </div>
          <div className="budget-track">
            <span />
          </div>
          <div className="demo-input-grid">
            <label>
              Intent value (ETH)
              <input
                type="number"
                min="0.01"
                step="0.05"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setResult(null)
                }}
              />
            </label>
            <label>
              Remaining budget
              <span className="readout">
                0.80 <small>ETH</small>
              </span>
            </label>
          </div>
          <label
            className={`policy-toggle ${tab === "Scope" ? "highlight" : ""}`}
          >
            <span>
              <KeyRound size={16} /> Vault.rebalance() allowed
            </span>
            <input
              type="checkbox"
              checked={targetAllowed}
              onChange={(e) => {
                setTargetAllowed(e.target.checked)
                setResult(null)
              }}
            />
          </label>
          <label
            className={`policy-toggle ${tab === "Revocation" ? "highlight" : ""}`}
          >
            <span>
              <Radio size={16} /> Live permission grant active
            </span>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => {
                setActive(e.target.checked)
                setResult(null)
              }}
            />
          </label>
          <Button className="mt-5 w-full" onClick={check}>
            <Play size={13} /> Check intent <ArrowRight size={15} />
          </Button>
          <div
            className={`demo-result ${result ? (result.ok ? "allowed" : "denied") : ""}`}
            role="status"
          >
            {result ? (
              result.ok ? (
                <Check size={16} />
              ) : (
                <ShieldX size={16} />
              )
            ) : (
              <span className="idle-dot" />
            )}
            {result
              ? result.reason
              : "Change the policy, then check the intent."}
          </div>
        </div>
      </ReferenceFrame>
      <p className="demo-note">
        Explore owner-policy checks locally. Full execution also enforces
        protocol rules, signatures, nonces, deadlines, and grant freshness.
      </p>
    </Section>
  )
}
function Developers() {
  const [copied, setCopied] = useState(false)
  const example = `// Define authority before the agent acts.\nregistry.grantAgent(\n  account,\n  agentKey,\n  1,       // SECP256K1\n  1 ether, // budget per epoch\n  1 days,  // epoch length\n  expiry\n);\n\nregistry.allow(account, vault, rebalanceSelector);`
  return (
    <Section id="developers">
      <SectionHeading
        eyebrow="Built around explicit interfaces"
        title="Make your protocol agent-native."
      >
        Give agents a clear action surface, and keep your protocol’s own safety
        rules in the execution path.
      </SectionHeading>
      <ReferenceFrame className="developer-grid">
        <div className="developer-copy">
          {[
            {
              icon: Code2,
              title: "Keep the contract in control",
              body: "Expose agent actions through the AgentNative interface. Validate the action against rules your protocol owns.",
            },
            {
              icon: GitBranch,
              title: "Separate identity from authority",
              body: "An agent key identifies the signer. A live grant determines the actions that signer may request.",
            },
            {
              icon: LockKeyhole,
              title: "Keep timing checks in execution",
              body: "Expiry, cooldown, and oracle freshness are checked where time-dependent logic belongs.",
            },
            {
              icon: Zap,
              title: "Build for the frame transaction model",
              body: "A verification frame validates the account; a sender frame executes the permitted protocol call.",
            },
          ].map((item) => (
            <article key={item.title}>
              <item.icon size={20} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="developer-code cornered">
          <CornerMarkers />
          <div className="code-top">
            <span />
            <span />
            <span />
            <small>PermissionRegistry.sol</small>
            <button
              aria-label="Copy grant example"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(example)
                  setCopied(true)
                } catch {
                  setCopied(false)
                }
              }}
            >
              {copied ? <Check size={14} /> : <Code2 size={14} />}
            </button>
          </div>
          <pre>
            <SolidityCode source={example} />
          </pre>
          <div className="developer-code-footer">
            <span>Solidity · owner-side configuration</span>
            <span role="status">
              {copied ? "Copied" : "Explicit by design"}
            </span>
          </div>
        </div>
      </ReferenceFrame>
      <div className="mt-9 text-center">
        <TextLink href="/docs">Read the technical overview</TextLink>
      </div>
    </Section>
  )
}

function Closing() {
  return (
    <section
      id="build-with-axon"
      className="axon-closing cornered overflow-hidden"
    >
      <CornerMarkers />
      <Suspense fallback={null}>
        <LandingShader variant="radial" className="closing-shader" />
      </Suspense>
      <span className="eyebrow">The next transaction needs a boundary.</span>
      <h2>
        Autonomous agents.
        <br />
        Accountable actions.
      </h2>
      <p>
        Build an agentic Web3 where permissions are explicit,
        <br className="hidden sm:block" /> protocols keep their rules, and
        owners keep authority.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ActionLink href="#playground" variant="secondary">
          Explore Axon <ArrowRight size={16} />
        </ActionLink>
        <SiteLink href="/docs" className="hero-docs">
          Read the docs <ArrowUpRight size={16} />
        </SiteLink>
      </div>
      <span className="closing-mark">
        <AxonMark size={40} />
      </span>
    </section>
  )
}
export function AxonHome() {

  return (
    <div className="axon-page">
      <Hero />
      <Separator />
      <Comparison />
      <Separator />
      <Architecture />
      <Separator fullWidth />
      <ApplicationFlow />
      <Separator fullWidth />
      <AuthorityFeatures />
      <Separator />
      <Developers />
      <Separator />
      <div className="axon-section policy-bento-section">
        <div className="container-shell policy-bento-grid">
          <Permissions />
          <Guardrails />
        </div>
      </div>
      <Separator />
      <Closing />
    </div>
  )
}

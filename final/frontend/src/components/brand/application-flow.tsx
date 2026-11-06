import { FlowConnectors } from "./isometric/flow-connectors"
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { AuthorityMachine } from "./isometric/authority-machine"
import { useEffect, useRef, useState } from "react"
import { Check, KeyRound, ShieldX, SlidersHorizontal, Zap, ArrowUpRight, Fingerprint, Layers3, Radio, ShieldCheck, Wallet, Network } from "lucide-react"
import { SiteLink } from "@/components/site-link"
import { AxonMark, SectionHeading } from "./primitives"

const steps = [
  {
    title: "A human defines the boundary.", label: "Identity & authority", icon: Fingerprint,
    body: "World ID proof gates agent creation and permission changes. An ENS subdomain on Sepolia identifies the agent; owner-signed registry updates define its live execution authority.",
    detail: "ENS is identity context. The demo executes agent calls through its configured account and agent key—not a different account for every selected name.",
    status: "Authority configured", heading: "Identity names it. The registry permits it.",
    note: "The execution account is funded and staked before it uses the alternative mempool.",
    facts: [["Identity", "World ID + ENS on Sepolia"], ["Authority", "Live PermissionRegistry grant"], ["Policy", "Key · scope · budget · expiry"]], nodes: ["registry"], edges: [],
  },
  {
    title: "Choose an action in the console.", label: "Request", icon: Wallet,
    body: "Select the agent lane, FinalCounter function and payment amount. The API reads the current grant, allowlist, remaining budget and intent nonce.",
    detail: "This walkthrough uses payAmount(uint256) with an explicit 0.0001 ETH payment. Human calls take a separate, ordinary transaction path.",
    status: "Request received", heading: "The request becomes a bounded intent.",
    note: "The intent binds the target, selector, encoded arguments, value, spend, nonce, deadline and current grant hash.",
    facts: [["Target", "FinalCounter"], ["Action", "payAmount(uint256)"], ["Value / spend", "0.0001 ETH"]], nodes: ["request", "registry", "sdk"], edges: ["request-sdk", "registry-sdk"],
  },
  {
    title: "Build and sign two frames.", label: "Prepare", icon: Layers3,
    body: "The server uses the Axon SDK and its configured agent key to prepare one signed EIP-8141 frame transaction. The browser does not hold the signing key.",
    detail: "Frame 0 calls AgentAccount.validate(). Frame 1 calls AgentAccount.execute(). The same prepared transaction is used for simulation and submission.",
    status: "Transaction signed", heading: "One transaction. Two distinct responsibilities.",
    note: "VERIFY checks authority and protocol admission. SENDER checks time-dependent settlement and executes the action.",
    facts: [["Frame 0", "VERIFY → validate()"], ["Frame 1", "SENDER → execute()"], ["Signer", "Server-held agent key"]], nodes: ["sdk", "simulate"], edges: ["sdk-simulate"],
  },
  {
    title: "Simulate before submitting.", label: "Simulation", icon: Radio,
    body: "The RPC simulates both frames and returns an execution trace alongside canonical-mempool eligibility. A successful execution simulation does not mean the canonical mempool will admit it.",
    detail: "Validation reads the external PermissionRegistry. On this devnet the simulator reports StorageReadNonSender for that foreign storage access. The app does not first broadcast a failing canonical transaction.",
    status: "Canonical path ineligible", heading: "Valid execution can still need another admission path.",
    note: "Live registry reads allow immediate revocation. They also exceed this devnet’s canonical validation storage rules.",
    facts: [["Execution trace", "Both frames simulated"], ["Canonical eligibility", "StorageReadNonSender"], ["Reason", "Registry storage is outside the sender"]], nodes: ["simulate", "registry", "canonical"], edges: ["simulate-canonical"],
  },
  {
    title: "Enter the alternative mempool.", label: "Admission", icon: Network,
    body: "The SDK submits the prepared frames to the sidecar. Its staked-account rules permit the wider storage access needed to read live authority, while signatures, structure, stake and validation trace still have to pass.",
    detail: "The account checks the active grant, signer, current grant hash, intent nonce and target selector. FinalCounter also validates the proposed action. Acceptance is conditional on all applicable checks.",
    status: "Alternative admission path", heading: "Wider storage access. The same authority checks.",
    note: "This is a different admission path to the same devnet—not a second execution chain or a bypass around owner policy.",
    facts: [["Submission", "eth_sendFrameTransaction"], ["Account", "Funded + staked"], ["Then", "Sidecar relays for onchain inclusion"]], nodes: ["simulate", "alt", "execute"], edges: ["simulate-alt", "alt-execute"],
  },
  {
    title: "Settle, execute, and inspect the result.", label: "Execution & receipt", icon: ShieldCheck,
    body: "In SENDER, the account enforces grant expiry, intent deadline and epoch budget, advances the nonce, records spend and calls FinalCounter. A successful agent payment adds 10 to the agent counter.",
    detail: "Bad authority fails validation. Settlement failures revert execution and may still consume gas. The console records the receipt, simulation, admission checks and updated state in Activity and transaction details.",
    status: "Onchain result", heading: "Permission becomes an observable outcome.",
    note: "Human lane: console → server owner wallet → ordinary transaction → FinalCounter. Humans add 1; agents add 10. The caller determines the lane.",
    facts: [["Settlement", "Expiry · deadline · remaining budget"], ["Success", "Agent counter +10; spend recorded"], ["Evidence", "Receipt + admission report + state"]], nodes: ["execute", "receipt"], edges: ["execute-receipt"],
  },
]

const readingPoints = [
  ["Prove you’re human with World ID before creating agents or changing permissions.", "Give the agent an ENS name on Sepolia; its records identify the account, key and policy.", "The owner defines live authority in the registry. This demo uses its configured execution account and agent key."],
  ["Choose the agent, FinalCounter action and payment amount in the console.", "The API reads the live grant, allowed actions, remaining budget and nonce.", "The intent binds one target and action to 0.0001 ETH, a deadline and the current grant hash."],
  ["The server-held agent key signs the transaction through the Axon SDK.", "VERIFY checks authority; SENDER settles and executes the action.", "The same prepared transaction is used for simulation and submission."],
  ["Simulate both transaction frames before submitting.", "Inspect execution and canonical admission separately: success does not guarantee admission.", "The live registry read reports StorageReadNonSender on this devnet, so the app uses the alternative path."],
  ["Submit the prepared transaction to the alternative-mempool sidecar.", "A funded, staked account can make the wider storage reads needed for live authority.", "Signature, stake, validation trace, live grant, nonce and protocol rules still have to pass."],
  ["SENDER checks grant expiry, the intent deadline and the remaining epoch budget.", "The account advances the nonce, records spend and calls FinalCounter. A successful agent payment adds 10.", "Inspect the receipt and admission report in Activity. Invalid authority fails validation; settlement can revert and still consume gas."],
]

function EthereumGlyph() {
  return (
    <svg viewBox="0 0 24 32" className="app-flow-ethereum" aria-hidden="true">
      <path d="M12 0 1 18l11 6 11-6Z" fill="#9be2e7" />
      <path d="M12 0v24l11-6Z" fill="#468b9a" />
      <path d="m1 20 11 12 11-12-11 6Z" fill="#72bdc7" />
      <path d="M12 26v6l11-12Z" fill="#316a7a" />
    </svg>
  )
}

function FlowCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className = "",
  tag,
  emblem,
}: {
  title: string
  subtitle: string
  icon: LucideIcon
  children?: ReactNode
  className?: string
  tag?: string
  emblem?: ReactNode
}) {
  return (
    <article className={`app-flow-card ${className}`}>
      <header>
        <span className="app-flow-icon">{emblem ?? <Icon size={16} />}</span>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {tag && <span className="app-flow-tag">{tag}</span>}
      </header>
      {children}
    </article>
  )
}
function MiniNode({icon:Icon,label,detail}: {icon:LucideIcon;label:string;detail:string}) {
  return <div className="flow-mini-node"><Icon size={17}/><div><strong>{label}</strong><small>{detail}</small></div></div>
}
function StageDiagram({ index, active }: { index: number; active: boolean }) {
  const card = (title: string, subtitle: string, icon: LucideIcon, children?: ReactNode, tag?: string) => <FlowCard title={title} subtitle={subtitle} icon={icon} tag={tag}>{children}</FlowCard>
  const stages = [
    <>
      {card("Owner identity", "World ID + ENS on Sepolia", Fingerprint, <div className="flow-card-body"><div className="flow-identity-pair"><MiniNode icon={Fingerprint} label="Human" detail="World ID proof"/><MiniNode icon={Network} label="Agent name" detail="ENS subdomain"/></div><div className="flow-records"><Layers3 size={14}/><span>Account <i/> Key <i/> Policy</span></div></div>)}
      {card("Permission grant", "Live authority, defined by the owner", KeyRound, <div className="flow-card-body"><MiniNode icon={KeyRound} label="Delegated agent key" detail="Authorized signer"/><div className="flow-scope"><span>Target contract</span><ArrowUpRight size={14}/><span>Function selector</span></div><div className="flow-budget-tile"><small>Budget per epoch</small><strong>0.01 <em>ETH</em></strong><div className="flow-budget-track"><i/></div></div><p className="flow-card-foot">Valid until owner-defined expiry</p></div>)}
    </>,
    <>{card("Intent", "What the agent wants", SlidersHorizontal, <div className="flow-card-body flow-intent-ticket"><span className="flow-ticket-origin"><AxonMark size={15}/> Console / API</span><div className="flow-action-target"><Layers3 size={23}/><strong>FinalCounter</strong><code>payAmount(uint256)</code></div><div className="flow-ticket-value"><strong>0.0001 <em>ETH</em></strong><span><EthereumGlyph/> Ethereum devnet</span></div></div>)}</>,
    <>
      {card("Agent key", "Server signs with the configured key", Fingerprint, <div className="flow-card-body flow-signature"><KeyRound size={24}/><span>Server-held key<small>Signs the prepared transaction</small></span><Check size={16}/></div>)}
      {card("Build the call", "One target. One bounded action.", Zap, <div className="flow-card-body"><div className="flow-call-target"><span>FinalCounter</span><strong>0.0001 ETH</strong></div><div className="flow-binding"><code>grantHash</code><span>+</span><code>nonce</code></div><p className="flow-card-foot">Bound to the intent deadline</p><div className="flow-frame-pair"><span><small>Frame 0</small>VERIFY</span><ArrowUpRight size={16}/><span><small>Frame 1</small>SENDER</span></div></div>)}
    </>,
    <>
      {card("Preflight", "Inspect the prepared transaction", Radio, <ol className="flow-check-pipeline">{[["Prepare once","Build and sign two frames"],["Simulate execution","Inspect both frame traces"],["Check eligibility","Execution success ≠ admission"]].map(([title,detail])=><li key={title}><span><Check size={12}/></span><div><strong>{title}</strong><small>{detail}</small></div></li>)}</ol>)}
      {card("Canonical path", "Reported by simulation, not broadcast", ShieldX, <div className="flow-card-body"><div className="flow-blocked-lane"><span>Canonical admission</span><ShieldX size={22}/><strong>Ineligible</strong></div><code className="flow-reason">StorageReadNonSender</code><p className="flow-card-foot">The live registry read needs the alternative admission path.</p></div>)}
    </>,
    <>
      {card("Live permission", "Account and protocol check authority", ShieldCheck, <div className="flow-card-body flow-authority-checks">{[["Agent key","Authorized signer"],["Grant","Exists + active"],["Scope","Target + selector"],["Freshness","Current grant hash"],["Replay","Intent nonce"],["Protocol","Action + value rules"]].map(([label,detail])=><div key={label}><Check size={13}/><strong>{label}</strong><small>{detail}</small></div>)}</div>, "VERIFY")}
      {card("Alt mempool", "Admission under staked-account rules", Network, <div className="flow-card-body"><div className="flow-admission-gate"><MiniNode icon={Wallet} label="Funded + staked" detail="Account admission requirement"/><div className="flow-gate-read"><Network size={19}/><strong>Wider storage reads</strong><small>Permitted under staked-account rules</small></div></div><p className="flow-card-foot">Signature + validation trace checked</p><div className="flow-relay">Relay for inclusion <ArrowUpRight size={16}/></div></div>)}
    </>,
    <>
      {card("Execute", "Call through the agent account", Wallet, <div className="flow-card-body"><div className="flow-settle-time"><Check size={13}/> Grant expiry + intent deadline</div><div className="flow-budget-tile"><small>Spend / epoch budget</small><strong>0.0001 <em>/ 0.01 ETH</em></strong><div className="flow-budget-track"><i style={{width:"1%"}}/></div></div><div className="flow-settlement-pipeline"><span>Advance nonce</span><span>Record spend</span><strong>FinalCounter <ArrowUpRight size={13}/></strong></div></div>, "SENDER")}
      <div className="flow-block-outcomes">
        {card("Confirmed", "Read the onchain receipt", Check, <div className="flow-card-body flow-receipt"><span><EthereumGlyph/> Agent account</span><strong>+10</strong><small>Agent counter · onchain result</small></div>)}
        {card("Rejected / reverted", "When a required check fails", ShieldX, <div className="flow-card-body"><div className="flow-failure-tags"><span>Revoked</span><span>Stale</span><span>Out of scope</span></div><p className="flow-card-foot">Bad authority fails validation. Expiry or excess budget reverts settlement; gas may still be charged.</p></div>)}
      </div>
    </>,
  ]
  return <div className={`flow-original-blocks ${active ? "is-active" : ""}`}>{stages[index]}</div>
}

export function ApplicationFlow() {
  const [active, setActive] = useState(0)
  const storyRef = useRef<HTMLDivElement>(null)
  const stepsRef = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    // Read positions together once per animation frame, including restored scroll positions.
    let frame = 0
    const update = () => {
      frame = 0
      const target = window.innerHeight * 0.42
      let closest = 0
      let distance = Infinity
      stepsRef.current.forEach((element, index) => {
        if (!element) return
        const rect = element.getBoundingClientRect()
        const next = Math.abs(rect.top + rect.height / 2 - target)
        if (next < distance) { distance = next; closest = index }
      })
      setActive(closest)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [])
  const step = steps[active]
  return (
    <section id="application-flow" className="axon-section application-flow">
      <div className="container-shell">
        <SectionHeading eyebrow="From intent to inclusion" title="One action. Every boundary checked.">
          Follow an agent payment through the actual Axon demo. The transaction moves down the diagram; each stage explains identity, live authority and alternative-mempool admission.
        </SectionHeading>
        <div className="flow-scroll-layout">
          <div className="flow-scroll-story" ref={storyRef}>
            <FlowConnectors storyRef={storyRef} activeStage={active} />
            {steps.map(({ label }, index) => (
              <article key={label} data-flow-stage={index} ref={element => { stepsRef.current[index] = element }} className={`flow-scroll-step flow-diagram-step ${active === index ? "is-active" : ""}`} aria-current={active === index ? "step" : undefined}>
                <div className={`flow-stage-composition ${index === 1 ? "has-one-card" : "has-split-cards"}`}>
                  <AuthorityMachine stage={index} active={active === index} />
                  <div className="flow-flat-companion"><StageDiagram index={index} active={active === index} /></div>
                </div>
              </article>
            ))}
            <SiteLink className="flow-story-link" href="/app">Try the live console <ArrowUpRight size={16} /></SiteLink>
          </div>
          <div className="flow-scroll-visual">
            <div className="flow-sticky-panel flow-text-panel">
              <header className="flow-panel-header"><span><AxonMark size={22} />Axon / Application flow</span><span>{active + 1} / {steps.length}</span></header>
              <div className="flow-stage-progress" aria-hidden="true">{steps.map((item, index) => <span key={item.label} className={index <= active ? "is-active" : ""} />)}</div>
              <div className="flow-stage-content" key={step.label}>
                <span className="flow-stage-status"><i />{step.status}</span><h3>{step.title}</h3><ul className="flow-reading-points">{readingPoints[active].map(point=><li key={point}>{point}</li>)}</ul><div className="flow-stage-summary"><h4>{step.heading}</h4>
                <dl>{step.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                <p className="flow-reading-note">{step.note}</p></div>
              </div>
              <div className="flow-panel-bottom"><span>Current demo · EIP-8141 devnet</span><SiteLink href="/app/activity">Inspect activity <ArrowUpRight size={13} /></SiteLink></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

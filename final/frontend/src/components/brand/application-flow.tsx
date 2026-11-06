import type { LucideIcon } from "lucide-react"
import {
  ArrowUpRight,
  Check,
  Fingerprint,
  KeyRound,
  Layers3,
  Radio,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Wallet,
  Zap,
} from "lucide-react"
import { SiteLink } from "@/components/site-link"
import { ReferenceFrame } from "./reference-frame"
import { AxonMark, SectionHeading } from "./primitives"
import type { ReactNode } from "react"

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
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="app-flow-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

export function ApplicationFlow() {
  return (
    <section id="application-flow" className="axon-section application-flow">
      <div className="container-shell">
        <SectionHeading
          eyebrow="From intent to inclusion"
          title="One action. Every boundary checked."
        >
          Follow an agent payment through Axon. The owner defines authority, the
          agent signs a scoped intent, and the account enforces the rules before
          the action can execute.
        </SectionHeading>
        <ReferenceFrame className="app-flow-frame">
          <div className="app-flow-caption">
            <span className="eyebrow">
              <span className="status-dot" /> Axon / Application flow
            </span>
            <span>Illustrative · FinalCounter payment</span>
          </div>
          <div
            className="app-flow-scroll"
            role="region"
            aria-label="Application flow diagram. Scroll horizontally on smaller screens."
            tabIndex={0}
          >
            <div className="app-flow-diagram">
              <div
                className="app-flow-zone app-flow-zone-intent"
                aria-hidden="true"
              >
                <span>01 / Define the action</span>
              </div>
              <div
                className="app-flow-zone app-flow-zone-check"
                aria-hidden="true"
              >
                <span>02 / Check authority</span>
              </div>
              <div
                className="app-flow-zone app-flow-zone-outcome"
                aria-hidden="true"
              >
                <span>03 / Execute or reject</span>
              </div>
              <div className="app-flow-authority-graphic">
                <div className="app-flow-authority-label">
                  Identity is not authority
                </div>
                <div className="app-flow-authority-nodes">
                  <div>
                    <span>
                      <Wallet size={22} />
                    </span>
                    <strong>Owner</strong>
                    <small>Defines the policy</small>
                  </div>
                  <ArrowUpRight size={16} />
                  <div>
                    <span>
                      <KeyRound size={22} />
                    </span>
                    <strong>Live grant</strong>
                    <small>Bounds the action</small>
                  </div>
                  <ArrowUpRight size={16} />
                  <div>
                    <span>
                      <Fingerprint size={22} />
                    </span>
                    <strong>Agent</strong>
                    <small>Signs the intent</small>
                  </div>
                </div>
                <p>
                  A delegated key can request an action. It cannot expand its
                  own permission.
                </p>
              </div>
              <svg
                className="app-flow-wires"
                viewBox="0 0 1164 720"
                fill="none"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="axon-flow-arrow"
                    markerWidth="5"
                    markerHeight="5"
                    refX="4"
                    refY="2.5"
                    orient="auto"
                  >
                    <path d="M0 0 L4 2.5 L0 5" className="app-flow-arrowhead" />
                  </marker>
                </defs>
                {[
                  "M248 90 H280",
                  "M364 136 V200",
                  "M448 260 H470 V180 H500",
                  "M598 300 V380",
                  "M728 438 H764 V134 H800",
                  "M884 188 V380",
                  "M968 434 H984",
                ].map((d) => (
                  <path key={d} d={d} markerEnd="url(#axon-flow-arrow)" />
                ))}
                <path
                  className="app-flow-denied-wire"
                  d="M728 600 H800"
                  markerEnd="url(#axon-flow-arrow)"
                />
                {[
                  [248, 90],
                  [280, 90],
                  [364, 136],
                  [364, 200],
                  [448, 260],
                  [500, 180],
                  [598, 300],
                  [598, 380],
                  [728, 438],
                  [800, 134],
                  [884, 188],
                  [884, 380],
                  [968, 434],
                  [984, 434],
                  [728, 600],
                  [800, 600],
                ].map(([x, y]) => (
                  <rect
                    className="app-flow-port"
                    key={`${x}-${y}`}
                    x={x - 2}
                    y={y - 2}
                    width="4"
                    height="4"
                  />
                ))}
              </svg>
              <div className="app-flow-intent">
                <FlowCard
                  title="Intent"
                  subtitle="What the agent wants"
                  icon={SlidersHorizontal}
                >
                  <Row label="From">
                    <span className="app-flow-chip">
                      <AxonMark className="app-flow-brandmark" /> Axon SDK
                    </span>
                    <span className="app-flow-muted"> / CLI</span>
                  </Row>
                  <Row label="Target">
                    <span className="app-flow-chip">
                      <Layers3 size={11} /> FinalCounter
                    </span>
                  </Row>
                  <Row label="Action">
                    <code>payAmount(uint256)</code>
                  </Row>
                  <Row label="Value">
                    <span className="app-flow-chip">0.0001 ETH</span>
                  </Row>
                  <Row label="Network">
                    <EthereumGlyph /> Ethereum devnet
                  </Row>
                </FlowCard>
              </div>
              <div className="app-flow-agent">
                <FlowCard
                  title="Agent key"
                  subtitle="Signs a bounded intent"
                  icon={Fingerprint}
                />
              </div>
              <div className="app-flow-call">
                <FlowCard
                  title="Build the call"
                  subtitle="One target. One action."
                  icon={Zap}
                >
                  <Row label="To">FinalCounter</Row>
                  <Row label="Value">0.0001 ETH</Row>
                  <Row label="Binds to">
                    <code>grantHash + nonce</code>
                  </Row>
                </FlowCard>
              </div>
              <div className="app-flow-prepare">
                <FlowCard
                  title="Preflight"
                  subtitle="Inspect before submission"
                  icon={Radio}
                  emblem={<AxonMark className="app-flow-brandmark" />}
                >
                  <div className="app-flow-check">
                    <Check size={13} />
                    <div>
                      Simulate execution<small>Check the intended call</small>
                    </div>
                  </div>
                  <div className="app-flow-check">
                    <Check size={13} />
                    <div>
                      Probe admission<small>Inspect alt-mempool checks</small>
                    </div>
                  </div>
                  <div className="app-flow-check">
                    <Check size={13} />
                    <div>
                      Build two frames<small>VERIFY → SENDER</small>
                    </div>
                  </div>
                </FlowCard>
              </div>
              <div className="app-flow-policy">
                <FlowCard
                  title="Live permission"
                  subtitle="Authority checked by the account"
                  icon={ShieldCheck}
                  tag="VERIFY"
                >
                  <Row label="Agent key">
                    <Check size={12} /> Authorized signer
                  </Row>
                  <Row label="Scope">
                    <Check size={12} /> Target + selector
                  </Row>
                  <Row label="Budget">
                    <span className="app-flow-budget">
                      <i />
                    </span>{" "}
                    0.0001 / 0.01 ETH
                  </Row>
                  <Row label="Freshness">
                    <Check size={12} /> Current grant hash
                  </Row>
                  <Row label="Replay">
                    <Check size={12} /> Nonce + deadline
                  </Row>
                </FlowCard>
              </div>
              <span className="app-flow-allowed">allowed</span>
              <div className="app-flow-sign">
                <FlowCard
                  title="Verify"
                  subtitle="Validate delegated authority"
                  icon={KeyRound}
                >
                  <p className="app-flow-note">
                    The account checks the signed intent.
                  </p>
                </FlowCard>
              </div>
              <div className="app-flow-send">
                <FlowCard
                  title="Execute"
                  subtitle="Call through the agent account"
                  icon={Wallet}
                >
                  <p className="app-flow-note">
                    Protocol rules and expiry still apply.
                  </p>
                </FlowCard>
              </div>
              <div className="app-flow-confirm">
                <FlowCard
                  title="Confirmed"
                  subtitle="Read the onchain receipt"
                  icon={Check}
                  className="app-flow-success"
                  emblem={<EthereumGlyph />}
                >
                  <Row label="Caller">Agent account</Row>
                  <Row label="Result">Agent counter +10</Row>
                </FlowCard>
              </div>
              <span className="app-flow-refused-label">denied</span>
              <div className="app-flow-refused">
                <FlowCard
                  title="Rejected"
                  subtitle="No authorized action executes"
                  icon={ShieldX}
                >
                  <p className="app-flow-note">
                    Revoked, out of scope, or over budget.
                  </p>
                </FlowCard>
              </div>
            </div>
          </div>
          <div className="app-flow-bottom">
            <span>
              Owner policy + protocol rules. Both must permit the action.
            </span>
            <SiteLink href="/app">
              Explore the live console <ArrowUpRight size={13} />
            </SiteLink>
          </div>
        </ReferenceFrame>
      </div>
    </section>
  )
}

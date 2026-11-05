import { ArrowRight, KeyRound, Network, ShieldCheck } from "lucide-react"
import { ActionLink } from "@/components/brand/primitives"
import { ReferenceFrame } from "@/components/brand/reference-frame"
export function Docs() {
  return (
    <div className="container-shell ds-layout axon-docs">
      <aside className="ds-nav">
        <span className="eyebrow">AXON / TECHNICAL OVERVIEW</span>
        {[
          ["Architecture", "architecture"],
          ["Permission grants", "grants"],
          ["Scope & intent", "scope"],
          ["Protocol rules", "protocol"],
          ["Revocation", "revocation"],
        ].map(([label, id]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
        <a className="text-primary" href="/#playground">
          Try the policy playground ↗
        </a>
      </aside>
      <article>
        <section id="architecture" className="ds-section pt-0">
          <span className="eyebrow">EIP-8141 DEVNET PROTOTYPE</span>
          <h1 className="display mt-5">Authority before execution.</h1>
          <p className="body-copy mt-7">
            Axon explores an agent-native permission layer for Ethereum. An
            owner delegates bounded authority to an agent key; the account
            checks the current grant and the protocol applies its own rules.
          </p>
          <ReferenceFrame className="mt-8 p-7">
            <div className="docs-flow">
              <span>
                <KeyRound /> Owner grant
              </span>
              <ArrowRight />
              <span>
                <Network /> Alt mempool
              </span>
              <ArrowRight />
              <span>
                <ShieldCheck /> Execution
              </span>
            </div>
          </ReferenceFrame>
          <p className="body-copy mt-6">
            The live-read AgentAccount consults a separate PermissionRegistry
            during validation. On this devnet, that foreign storage read makes
            its transaction inadmissible to the EIP-8141 public mempool. The
            alt-mempool path is what allows the account to validate against
            current external authority.
          </p>
        </section>
        <section id="grants" className="ds-section">
          <h2>01 / Permission grants</h2>
          <p className="body-copy">
            The owner configures the agent key, key scheme, budget per epoch,
            epoch length, and expiry. Account registration binds the account to
            its owner. Only that owner can update or revoke the grant.
          </p>
          <div className="surface mt-6 p-6">
            <code className="text-sm text-primary">
              PermissionRegistry.grantAgent(account, agentKey, keyScheme,
              budgetPerEpoch, epochLength, expiresAt)
            </code>
          </div>
          <p className="body-copy mt-6">
            The account tracks value spent per policy epoch. Execution settles
            the counter; admission checks test the intent against the remaining
            budget. Time-dependent checks run during execution so the validation
            prefix remains time-free.
          </p>
        </section>
        <section id="scope" className="ds-section">
          <h2>02 / Scope & intent</h2>
          <p className="body-copy">
            An allowlist pairs a target address with a function selector. Each
            intent is tied to the current grant hash and carries a nonce and
            deadline. A grant update or allowlist change increments the grant
            version and recomputes the hash.
          </p>
          <div className="surface mt-6 p-6">
            <code className="text-sm text-primary">
              registry.allow(account, target, selector)
            </code>
          </div>
          <p className="body-copy mt-6">
            The account distinguishes identity from authority. The signature
            identifies the agent; the current grant and allowlist determine what
            that agent may request. An expired, stale, unauthorized, or replayed
            intent fails the corresponding checks.
          </p>
        </section>
        <section id="protocol" className="ds-section">
          <h2>03 / Protocol rules</h2>
          <p className="body-copy">
            An owner grant does not override the destination protocol.
            AgentNative defines an action-validation interface, and AgentVault
            demonstrates protocol-owned limits: withdrawals pay the account
            owner; rebalances respect trade size, oracle freshness, slippage,
            and cooldown.
          </p>
          <p className="body-copy mt-6">
            The frame transaction has a verification frame for account
            validation and a sender frame for execution. Time-dependent rules
            are enforced in the execution path. The demo playground illustrates
            owner-policy decisions; it does not submit a transaction or replace
            full account and protocol validation.
          </p>
        </section>
        <section id="revocation" className="ds-section">
          <h2>04 / Live revocation</h2>
          <p className="body-copy">
            Revoking a live grant sets it inactive and changes its hash. Pending
            intents tied to the previous grant fail freshness checks against
            current state.
          </p>
          <p className="body-copy mt-6">
            MirrorAgentAccount exists as a comparison: it reads a locally copied
            grant and allowlist. That model can validate using local storage,
            but its authority remains stale until the owner calls syncGrant.
            Axon’s live-read account deliberately avoids that synchronization
            gap.
          </p>
          <div className="mt-8">
            <ActionLink href="/#playground">
              Explore the guardrails <ArrowRight size={16} />
            </ActionLink>
          </div>
        </section>
      </article>
    </div>
  )
}

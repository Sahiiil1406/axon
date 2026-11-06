import { useState } from "react"
import { ArrowRight, ArrowUpRight, Check, Code2, Fingerprint, KeyRound, Radio, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react"
import { SolidityCode } from "@/components/solidity-code"
import { SiteLink } from "@/components/site-link"
import { SectionHeading } from "./primitives"

const example=`// Define authority before the agent acts.
registry.grantAgent(
  account,
  agentKey,
  1,       // SECP256K1
  1 ether, // budget per epoch
  1 days,  // epoch length
  expiry
);

registry.allow(account, vault, rebalanceSelector);`

export function AuthorityBento() {
  const [copied,setCopied]=useState(false)
  const [copyError,setCopyError]=useState(false)
  async function copy(){
    try {await navigator.clipboard.writeText(example);setCopied(true);setCopyError(false);window.setTimeout(()=>setCopied(false),2000)}
    catch {setCopyError(true)}
  }
  return <section className="axon-section authority-bento-section" id="developers"><div className="container-shell">
    <SectionHeading eyebrow="Built around explicit interfaces" title="Make your protocol agent-native.">Give agents a clear action surface, and keep your protocol’s own safety rules in the execution path.</SectionHeading>
    <div className="authority-bento">
      <article className="bento-delegate" id="authority-features"><SlidersHorizontal size={23}/><h3>Delegate precisely</h3><p>Set the target contracts, callable functions, spending budget, and expiry for each agent key.</p><div className="bento-scope"><span>Target</span><ArrowRight size={13}/><span>Function</span></div><div className="bento-budget"><span>Epoch budget</span><strong>1 ETH</strong><i/></div></article>
      <article className="bento-live"><Radio size={23}/><h3>Validate live authority</h3><p>Read the current permission registry during validation, so changes do not depend on a mirrored grant.</p><div className="bento-live-read"><span><i/> Live registry</span><ArrowRight size={16}/><ShieldCheck size={26}/></div></article>
      <article className="bento-enforce"><ShieldCheck size={23}/><h3>Enforce at execution</h3><p>Owner permissions and protocol rules both govern the action. The agent cannot waive either boundary.</p><div className="bento-checks"><span><Check size={13}/> Owner policy</span><span><Check size={13}/> Protocol rules</span></div></article>
      <article className="bento-code"><header><span><Code2 size={15}/> PermissionRegistry.sol</span><button onClick={copy} aria-label="Copy grant example">{copied?<Check size={15}/>:<Code2 size={15}/>} {copied?"Copied":copyError?"Try again":"Copy"}</button></header><pre><SolidityCode source={example}/></pre><footer><span>Solidity · owner-side configuration</span><span>Explicit by design</span></footer></article>
      <article className="bento-contract"><Code2 size={23}/><h3>Keep the contract in control</h3><p>Expose agent actions through the AgentNative interface. Validate the action against rules your protocol owns.</p><div className="bento-contract-call"><code>AgentNative</code><ArrowRight size={14}/><code>validateAgentAction()</code></div></article>
      <article className="bento-identity"><Fingerprint size={23}/><h3>Separate identity from authority</h3><p>An agent key identifies the signer. A live grant determines the actions that signer may request.</p><div className="bento-identity-pair"><span><KeyRound size={16}/> Agent key<small>Who is signing?</small></span><span><ShieldCheck size={16}/> Live grant<small>What is allowed?</small></span></div></article>
      <article className="bento-time"><h3>Keep timing checks in execution</h3><p>Expiry, cooldown, and oracle freshness are checked where time-dependent logic belongs.</p><div className="bento-time-rail"><span>Expiry</span><span>Cooldown</span><span>Oracle freshness</span></div></article>
      <article className="bento-frames"><Zap size={23}/><h3>Build for the frame transaction model</h3><p>A verification frame validates the account; a sender frame executes the permitted protocol call.</p><div className="bento-frame-flow"><span><small>Frame 0</small><strong>VERIFY</strong><code>validate(intent)</code></span><ArrowRight size={20}/><span><small>Frame 1</small><strong>SENDER</strong><code>execute(intent)</code></span></div></article>
    </div>
    <SiteLink href="/docs/developers" className="bento-docs-link">Explore developer integration <ArrowUpRight size={16}/></SiteLink>
  </div></section>
}

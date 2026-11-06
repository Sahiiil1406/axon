import { CornerMarkers } from "./brand/reference-frame"
import { useId } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Wallet, Bot, Fingerprint, LayoutDashboard, Braces, FileCode2, Radio, Network, KeyRound, ShieldCheck, Blocks } from "lucide-react"

export const architectureSections=[
  {id:"architecture",label:"System overview"},
  {id:"architecture-components",label:"Components and responsibilities"},
  {id:"architecture-flow",label:"One action, end to end"},
  {id:"architecture-boundaries",label:"Networks and trust boundaries"},
]
const components=[
  ["Owner wallet","Owns the account and authorizes grants, scope changes and revocation. Owner writes are distinct from agent-signed actions. The current demo uses configured server wallets; self-service wallet onboarding is separate work."],
  ["Portal + API","The React console presents agents, permissions and activity. The Node API coordinates state reads, identity workflows and calls. It must associate each request with the account and signer it is allowed to operate."],
  ["Agent runtime + SDK","The agent observes and proposes an action. The SDK builds a scoped intent, signs a two-frame transaction, simulates and submits it. Optional model decisions cannot replace account validation."],
  ["World ID + ENS","World ID verifies humanness for protected onboarding and permission workflows. ENS on Sepolia provides agent names and account/key records. Execution authority still comes from the live devnet registry."],
  ["Execution RPC","Serves account state and transaction data. Simulates both frames and reports execution results separately from canonical-mempool eligibility."],
  ["Alternative-mempool sidecar","Checks signatures, structure, stake and validation trace under staked-account admission rules, then relays accepted transactions for inclusion on the same devnet."],
  ["PermissionRegistry","Stores owner-controlled grants and target-selector permissions. Changes update the live authority version/hash; revocation invalidates the old grant."],
  ["AgentAccount","VERIFY checks signer, live grant, scope, grant hash, nonce and protocol rules. SENDER enforces time and budget conditions, records settlement and calls the protocol."],
  ["Protocol contract","Applies application-owned rules. FinalCounter demonstrates different human and agent outcomes; AgentVault demonstrates a richer policy surface."],
  ["Code generation","Builds an action manifest from annotated Solidity, compiled ABI and deployment metadata. The agent and SDK consume the manifest; it describes actions but does not grant permission."],
]
function ArchitectureDiagram(){
  const id=useId()
  const icons=[Wallet, Bot, Fingerprint, LayoutDashboard, Braces, FileCode2, Radio, Network, KeyRound, ShieldCheck, Blocks]
  const nodes=[
    {x:32,y:72,title:"Owner wallet",lines:["Account ownership","Grant · scope · revoke"]},
    {x:648,y:72,title:"Agent runtime",lines:["Observe → plan → propose","Optional LLM + manifest"]},
    {x:32,y:218,title:"World ID + ENS",lines:["Human verification + naming","ENS identity on Sepolia"]},
    {x:340,y:145,title:"Portal / console",lines:["Agents · permissions · activity","Owner controls + result UI"]},
    {x:340,y:390,title:"API + Axon SDK",lines:["Build intent · sign frames","Prepare once, reuse payload"]},
    {x:648,y:218,title:"Codegen / manifest",lines:["Annotations + ABI + addresses","Action metadata, not authority"]},
    {x:152,y:600,title:"Execution RPC",lines:["Live state + frame simulation","Canonical eligibility + traces"]},
    {x:528,y:600,title:"Alt-mempool sidecar",lines:["Signature · stake · trace checks","Relay to the same devnet"]},
    {x:32,y:800,title:"PermissionRegistry",lines:["Live grant + allowed selectors","Owner-defined authority"]},
    {x:340,y:800,title:"AgentAccount",lines:["VERIFY: validate authority","SENDER: settle + execute"]},
    {x:648,y:800,title:"Protocol contract",lines:["FinalCounter / agent-native app","Protocol-owned action rules"]},
  ]
  const wire=(d:string,label:string,x:number,y:number,secondary=false)=><g key={label}><path className={secondary?"arch-wire-secondary":"arch-wire"} d={d} markerEnd={`url(#${id})`}/><rect className="arch-label-bg" x={x-label.length*2.7-6} y={y-10} width={label.length*5.4+12} height="19"/><text className="arch-edge-label" x={x} y={y+3} textAnchor="middle">{label}</text></g>
  return <figure className="architecture-system-diagram cornered"><CornerMarkers/><figcaption>System map · the control plane defines authority; the execution plane enforces it.</figcaption><div className="architecture-svg-scroll"><svg viewBox="0 0 920 960" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>Axon system architecture</title><desc id={`${id}-desc`}>Owner and identity workflows enter through the portal. An agent uses the API and SDK to prepare a signed transaction. The RPC simulates it and the alternative-mempool sidecar relays it. On the devnet, AgentAccount reads PermissionRegistry and calls the protocol. Codegen provides action metadata. ENS identity is on Sepolia, separate from execution.</desc>
    <defs><marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="var(--primary)" strokeWidth="1.4"/></marker></defs>
    {[
      {x:12,y:16,width:588,height:314,label:"Identity and owner control",green:true},
      {x:628,y:16,width:280,height:314,label:"Agent tools",green:false},
      {x:316,y:350,width:288,height:151,label:"Transaction preparation",green:false},
      {x:128,y:544,width:664,height:170,label:"Simulation and alternative admission",green:false},
      {x:12,y:744,width:896,height:180,label:"Execution devnet · same settlement network",green:true},
    ].map(group=><g key={group.label}>
      <rect className={group.green ? "arch-chain-zone" : "arch-zone"} x={group.x} y={group.y} width={group.width} height={group.height}/>
      <text className="arch-zone-label" x={group.x+20} y={group.y+25}>{group.label}</text>
    </g>)}
    {wire("M272 116 H310 V176 H340","Owner operations",420,126)}
    {wire("M272 262 H310 V208 H340","Identity context",420,254,true)}
    {wire("M460 233 V390","Request",460,313)}
    {wire("M888 116 H916 V434 H580","Candidate action",768,434)}
    {wire("M648 262 H614 V414 H580","Action schema",689,371,true)}
    {wire("M400 478 V524 H272 V600","Simulate / read",272,524)}
    {wire("M520 478 V524 H648 V600","Submit",648,524)}
    {wire("M648 688 V730 H460 V800","Admission → inclusion",614,730)}
    {wire("M340 844 H272","Read live grant",306,790)}
    {wire("M580 844 H648","Execute call",614,790)}
    {nodes.map((node,index)=>{
      const Icon=icons[index]
      const green=[0,2,3,8].includes(index)
      return <g key={node.title} className={`arch-component ${green ? "arch-component-green" : "arch-component-cyan"}`} transform={`translate(${node.x} ${node.y})`}>
        <rect className="arch-node-depth" x="3" y="4" width="240" height="88"/>
        <rect className="arch-node" width="240" height="88"/>
        <path className="arch-node-header" d="M.5 .5H239.5V37H.5Z"/>
        <Icon x={13} y={11} width={18} height={18} className="arch-component-icon" strokeWidth={1.5}/>
        <text className="arch-node-title" x="40" y="25">{node.title}</text>
        {node.lines.map((line,i)=><text className="arch-node-detail" key={line} x="14" y={58+i*17}>{line}</text>)}
      </g>
    })}
    <text className="arch-footnote" x="32" y="910">Owner-signed policy writes update the registry. Results return to the portal through the API / SDK.</text>
  </svg></div></figure>
}
export function ArchitectureOverview(){
  return <div className="architecture-overview"><section id="architecture"><span className="eyebrow">Architecture / Overview</span><h1 className="display mt-5">How Axon fits together.</h1><p className="sdk-lead mt-6">An agent proposes an action. The owner’s live policy and the destination protocol decide what can execute. This map shows the components that carry that decision from the portal to the chain.</p><ArchitectureDiagram/></section>
    <section id="architecture-components" className="sdk-guide-section"><h2>Components and responsibilities</h2><div className="quickstart-concepts">{components.map(([title,body])=><div className="cornered" key={title}><CornerMarkers/><strong>{title}</strong><p>{body}</p></div>)}</div></section>
    <section id="architecture-flow" className="sdk-guide-section"><h2>One action, end to end</h2><ol className="quickstart-steps">{["The owner establishes a grant, permitted target/functions, spending budget and expiry.","The agent selects a manifest action. The SDK reads the current grant, nonce and chain timestamp, then builds a bounded intent.","The configured agent key signs one transaction containing VERIFY and SENDER frames.","The RPC simulates that prepared transaction. A foreign registry read can be executable but canonically ineligible on this devnet.","The sidecar evaluates alternative admission for the funded, staked account and relays an accepted transaction.","AgentAccount validates live authority and protocol checks, then settles time/budget constraints and executes the call.","The application shows admission evidence, chain status and receipt. Rejection, revert and successful execution remain separate outcomes."].map(text=><li key={text}>{text}</li>)}</ol></section>
    <section id="architecture-boundaries" className="sdk-guide-section"><h2>Networks and trust boundaries</h2><p>The execution account, registry and demo protocol run on the EIP-8141 devnet. The sidecar is an alternative admission path to that same chain. ENS identity records currently live on Sepolia; World ID is an external verification service. These systems do not automatically share ownership or execution authority.</p><p>The current demo API uses configured signers. A production portal needs wallet-authorized owner operations, account-specific signer custody, authentication and transaction reconciliation. Private agent keys belong in trusted runtimes, never in the public frontend bundle.</p><div className="docs-topic-links"><Link to="/docs/architecture/permission-layer">Permission layer <ArrowUpRight size={14}/></Link><Link to="/docs/architecture/alt-mempool">Alternative admission <ArrowUpRight size={14}/></Link><Link to="/docs/sdk/transaction-lifecycle">SDK transaction lifecycle <ArrowUpRight size={14}/></Link></div></section>
  </div>
}

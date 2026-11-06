import { ArrowRight, ArrowUpRight, Check, Fingerprint, Globe, KeyRound, ScanFace, ShieldCheck, UserRound } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useConsole } from "./model"

export function IdentityOverview(){
  const {state,loading,busy,ens,worldIdStatus,worldIdSkipped,verifyWorldId}=useConsole()
  const proofReady=worldIdStatus==="verified"&&!worldIdSkipped
  const status=worldIdSkipped?"Testing bypass":proofReady?"Proof ready":worldIdStatus==="verifying"?"Awaiting your approval":worldIdStatus==="failed"?"Verification incomplete":"Human check required"
  const humanName=ens.humanName??state?.ens?.humanName
  const agents=ens.agents
  return <section className="identity-overview" aria-label="World ID and ENS identity">
    <header className="identity-overview-heading"><div><span className="identity-kicker"><UserRound size={13}/> Human-controlled agents</span><h2>Prove the human. Name the agent. Bound its authority.</h2></div><span className="identity-devnet-label">World ID + ENS</span></header>
    <div className="identity-passport-grid">
      <article className="identity-passport identity-world"><div className="identity-brand-row"><span className="identity-brand-icon"><ScanFace size={25}/></span><div><strong>World ID</strong><span>Human verification · IDKit</span></div><span className={`identity-proof-state ${proofReady?"ready":""}`}>{proofReady?<Check size={13}/>:<Fingerprint size={13}/>} {status}</span></div>
        <h3>A human confirms the important action.</h3><p>Provide a Proof of Human before creating an agent identity or changing delegated authority. The server checks the proof when the protected action is submitted.</p>
        <div className="identity-verification-action"><Button variant="outline" disabled={loading||!!busy||worldIdStatus==="verifying"||!state||proofReady} onClick={()=>void verifyWorldId()}><ScanFace size={16}/>{proofReady?"Proof ready for submission":worldIdStatus==="verifying"?"Complete the World ID prompt":worldIdStatus==="failed"?"Try World ID again":"Continue with World ID"}</Button></div>
        <div className="identity-proof-progress"><span className={proofReady?"complete":""}><i/> Request proof</span><ArrowRight size={12}/><span><i/> Verify on server</span><ArrowRight size={12}/><span><i/> Submit action</span></div>
        {worldIdSkipped&&<p className="identity-testing-note">Local testing bypass is active. This is not a verified World ID result.</p>}
        {worldIdStatus==="failed"&&<p className="identity-testing-note">The check did not complete. Protected actions still require a valid proof; you can retry or keep exploring read-only pages.</p>}
      </article>
      <article className="identity-passport identity-ens"><div className="identity-brand-row"><span className="identity-brand-icon"><Globe size={25}/></span><div><strong>ENS</strong><span>Agent identity · Sepolia</span></div><span className="identity-network-chip">Name → account</span></div>
        <div className="identity-ens-name"><span>Configured namespace</span><strong>{humanName??(loading?"Resolving identity…":"No namespace configured")}</strong></div>
        <div className="identity-agent-records"><div><span>Agent identities</span><strong>{agents.length}</strong></div><div><span>Identity records</span><strong>Account + agent key</strong></div></div>
        <div className="identity-agent-names">{agents.length?agents.slice(0,3).map(agent=><span key={agent.name}><Globe size={12}/>{agent.name}</span>):<span className="identity-empty-name">Your first named agent starts here.</span>}</div>
        <Link className="identity-manage-link" to="/app/agents">{agents.length?"Manage ENS agents":"Create an agent identity"}<ArrowUpRight size={15}/></Link>
      </article>
    </div>
    <div className="identity-authority-strip"><span><Fingerprint size={16}/><strong>World ID</strong> Human confirmation</span><ArrowRight size={14}/><span><Globe size={16}/><strong>ENS</strong> Named identity</span><ArrowRight size={14}/><span><KeyRound size={16}/><strong>Axon</strong> Live authority</span><Link to="/app/permissions">Inspect permissions <ArrowUpRight size={14}/></Link></div>
    <details className="identity-trust-explainer"><summary><ShieldCheck size={14}/> Why this human check?</summary><div><p><strong>The trust moment:</strong> creating an agent namespace or changing what an agent can do. Human verification adds a deliberate human checkpoint before the server processes that protected action.</p><p><strong>The credential:</strong> Proof of Human establishes humanness; Axon does not request passport attributes or nationality for this flow. It does not establish ownership of an ENS name or a wallet. Owner authorization and live grant checks remain separate responsibilities.</p><p><strong>If verification cannot complete:</strong> cancel or retry the request, and continue browsing state and activity. The backend requires a valid proof for protected writes. A proof is consumed by the action; you may need another proof for the next change.</p><p><strong>Execution stays on the devnet:</strong> ENS records are on Sepolia. World ID is an external identity check. Neither is an alternative execution network or an unrestricted agent permission.</p></div></details>
  </section>
}

export function ProfilePage(){
  return <><h1 className="sr-only">Profile: human verification and agent identity</h1><IdentityOverview/></>
}

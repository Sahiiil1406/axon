import { useEffect, useId, useRef, useState } from "react"
import { Check, KeyRound, ShieldCheck, ShieldX, UserRound, Fingerprint, ArrowUpRight, Network } from "lucide-react"
import { ReferenceFrame } from "./reference-frame"
import "./authority-circuit.css"

const scenarios = [
  {id:"owner",label:"Owner updates policy",status:"Owner signature accepted",title:"The owner changes the boundary.",detail:"An owner-authorized registry update changes live policy. The agent cannot sign this update on the owner’s behalf.",outcome:"Policy updated",reason:"Owner-authorized write",icon:UserRound},
  {id:"allowed",label:"Allowed agent",status:"Action permitted",title:"The action fits every boundary.",detail:"The signer, live grant, scope and freshness checks pass. Protocol rules and settlement checks also pass before execution.",outcome:"Executed",reason:"Within delegated authority",icon:ShieldCheck},
  {id:"blocked",label:"Out-of-scope agent",status:"Scope check fails",title:"A valid key is not unlimited authority.",detail:"The agent signs a request for a function outside its allowed scope. Validation rejects the request before the protocol action executes.",outcome:"Rejected",reason:"Target / selector not allowed",icon:ShieldX},
  {id:"revoked",label:"Revoked grant",status:"Live grant is inactive",title:"Old signatures cannot preserve a revoked grant.",detail:"The owner revokes live authority. A previously signed agent request fails validation against the current registry state.",outcome:"Rejected",reason:"Live grant revoked",icon:KeyRound},
] as const

function Trace({d,active=false,muted=false,tone="cyan"}: {d:string;active?:boolean;muted?:boolean;tone?:"cyan"|"green"}){
  return <g className={`authority-trace authority-trace-${tone} ${active?"is-active":""} ${muted?"is-muted":""}`}><path d={d}/>{active&&<path className="authority-trace-pulse" d={d} pathLength="1"/>}</g>
}
function Layer({cy,title,detail,active,blocked=false}: {cy:number;title:string;detail:string;active:boolean;blocked?:boolean}){
  return <g className={`authority-layer ${title === "Execution" ? "authority-layer-execution" : ""} ${active?"is-active":""} ${blocked?"is-blocked":""}`}>
    <path className="authority-layer-side" d={`M540 ${cy} L700 ${cy+50} L860 ${cy} V${cy+14} L700 ${cy+64} L540 ${cy+14} Z`}/>
    <path className="authority-layer-top" d={`M540 ${cy} L700 ${cy-50} L860 ${cy} L700 ${cy+50} Z`}/>
    <path className="authority-layer-inset" d={`M566 ${cy} L700 ${cy-41} L834 ${cy} L700 ${cy+41} Z`}/>
    <text className="authority-layer-title" x="700" y={cy-3} textAnchor="middle">{title}</text><text className="authority-layer-detail" x="700" y={cy+15} textAnchor="middle">{detail}</text>
    <rect className="authority-layer-port" x="536" y={cy-4} width="8" height="8"/><rect className="authority-layer-port" x="856" y={cy-4} width="8" height="8"/>
  </g>
}

export function AuthorityCircuit(){
  const [selected,setSelected]=useState(2)
  const [visible,setVisible]=useState(false)
  const ref=useRef<HTMLDivElement>(null)
  const id=useId()
  const scenario=scenarios[selected]
  const owner=scenario.id==="owner", allowed=scenario.id==="allowed", blocked=scenario.id==="blocked"||scenario.id==="revoked"
  useEffect(()=>{
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.1})
    if(ref.current)observer.observe(ref.current)
    return()=>observer.disconnect()
  },[])
  return <ReferenceFrame className={`authority-circuit ${visible?"is-visible":""}`}><div ref={ref}>
    <header className="authority-circuit-header"><span><i/> Axon / Authority flow</span><span>Ethereum · EIP-8141 devnet</span></header>
    <div className="authority-scenarios" role="group" aria-label="Authority flow scenario">{scenarios.map((item,index)=><button type="button" key={item.id} aria-pressed={selected===index} onClick={()=>setSelected(index)}><item.icon size={14}/>{item.label}</button>)}</div>
    <div className="authority-circuit-scroll"><svg viewBox="0 0 1200 610" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Owner authority and agent validation circuit</title><desc id={`${id}-desc`}>An owner can update a permission grant. Agents submit signed intents through alternative admission. Live permission, protocol rules and settlement layers separate permitted execution from rejection. Current illustration: {scenario.detail}</desc>
      <defs><pattern id={`${id}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r=".65" fill="var(--border)"/></pattern></defs>
      <rect width="1200" height="610" fill={`url(#${id}-dots)`} opacity=".45"/>
      <path className="authority-circuit-rail" d="M20 190 H1180 M20 470 H1180"/>
      <text className="authority-zone-label" x="40" y="35">Owner control plane</text><text className="authority-zone-label" x="40" y="300">Agent action plane</text>
      <Trace d="M260 124 H350 V102 H465" tone="green" active={owner||scenario.id==="revoked"}/>
      <Trace d="M600 145 V180 H700 V220" tone="green" active={owner||scenario.id==="revoked"}/>
      <Trace d="M260 395 H300 V245 H330" active={!owner}/>
      <Trace d="M490 245 H515 V270 H540" active={!owner}/>
      <Trace d="M700 320 V360" active={allowed}/><Trace d="M700 410 V450" active={allowed}/>
      <Trace d="M860 450 H930 V395 H970" tone="green" active={allowed}/>
      <Trace d="M860 270 H910 V530 H970" active={blocked} muted/>
      <g className="authority-node" transform="translate(40 76)"><rect width="220" height="96"/><UserRound x="17" y="17" size={23}/><text className="authority-node-title" x="53" y="34">Owner</text><text x="18" y="60">Defines and changes authority</text><text className="authority-node-code" x="18" y="79">Wallet-signed policy update</text></g>
      <g className={`authority-node authority-grant ${owner?"is-active":""}`} transform="translate(465 56)"><rect width="270" height="89"/><KeyRound x="16" y="17" size={20}/><text className="authority-node-title" x="48" y="31">Permission grant</text><text x="17" y="55">Scope · budget · expiry</text><text className="authority-node-code" x="17" y="73">{scenario.id==="revoked"?"Live state: revoked":"Live registry · owner-controlled"}</text></g>
      <g className="authority-wire-label" transform="translate(345 112)"><rect x="-47" y="-11" width="94" height="22"/><text textAnchor="middle" y="4">Owner signature</text></g>
      <g className="authority-node" transform="translate(40 340)"><rect width="220" height="110"/><Fingerprint x="17" y="17" size={23}/><text className="authority-node-title" x="53" y="34">Agent intent</text><text x="18" y="63">Signs one bounded action</text><text className="authority-node-code" x="18" y="84">{scenario.id==="blocked"?"Requested selector: not allowed":scenario.id==="revoked"?"Signed against previous authority":"Target + args + value + nonce"}</text></g>
      <g className="authority-node authority-sidecar" transform="translate(330 201)"><rect width="160" height="88"/><Network x="14" y="14" size={18}/><text className="authority-node-title" x="41" y="29">Alt mempool</text><text x="14" y="52">Staked-account rules</text><text className="authority-node-code" x="14" y="71">Signature + trace checks</text></g>
      <Layer cy={450} title="Execution" detail="Time · budget · protocol call" active={allowed}/>
      <Layer cy={360} title="Protocol rules" detail="The application has a say" active={allowed}/>
      <Layer cy={270} title="Live permission" detail="Signer · scope · hash · nonce" active={!owner} blocked={blocked}/>
      <g className="authority-wire-label" transform="translate(700 199)"><rect x="-54" y="-11" width="108" height="22"/><text textAnchor="middle" y="4">Read current grant</text></g>
      <g className={`authority-node authority-result ${allowed?"is-accepted":""}`} transform="translate(970 350)"><rect width="190" height="100"/><ShieldCheck x="15" y="17" size={22}/><text className="authority-node-title" x="47" y="33">Execution</text><text x="15" y="60">{allowed?"Permitted action included":"Only after all checks pass"}</text><text className="authority-node-code" x="15" y="80">Owner + protocol boundaries</text></g>
      <g className={`authority-node authority-result ${blocked?"is-rejected":""}`} transform="translate(970 488)"><rect width="190" height="87"/><ShieldX x="15" y="15" size={21}/><text className="authority-node-title" x="47" y="31">Rejected</text><text x="15" y="55">{scenario.id==="revoked"?"Live grant is inactive":"Target / selector denied"}</text><text className="authority-node-code" x="15" y="73">No protocol action executes</text></g>
      <g className="authority-layer-caption"><text x="700" y="560" textAnchor="middle">One action. Multiple independent boundaries.</text><text x="700" y="580" textAnchor="middle">VERIFY establishes authority. SENDER settles execution.</text></g>
      <g className="authority-signal-legend"><circle cx="46" cy="548" r="3"/><text x="58" y="552">Moving signals illustrate requests, not live transactions.</text></g>
    </svg></div>
    <div className="authority-circuit-explanation" aria-live="polite"><div><span className="authority-circuit-status"><i/>{scenario.status}</span><h3>{scenario.title}</h3><p>{scenario.detail}</p></div><div className={`authority-outcome ${blocked?"is-rejected":""}`}><scenario.icon size={20}/><strong>{scenario.outcome}</strong><span>{scenario.reason}</span></div></div>
    <footer className="authority-circuit-footer"><span><Check size={13}/> Live grant reads</span><span><Check size={13}/> Scoped intents</span><span><Check size={13}/> Protocol-owned rules</span><span><ArrowUpRight size={13}/> Illustrative scenarios</span></footer>
  </div></ReferenceFrame>
}

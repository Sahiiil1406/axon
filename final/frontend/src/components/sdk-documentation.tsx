import { CornerMarkers } from "./brand/reference-frame"
import { useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import guide from "../../../../sdk/README.md?raw"

export const sdkAnchor = (title: string) => `sdk-${title.toLowerCase().replace(/^\d+\.\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`
export const sdkSections = guide.split(/^## /m).slice(1).map(section => {
  const newline = section.indexOf("\n")
  return { title: section.slice(0, newline), body: section.slice(newline + 1), id: sdkAnchor(section.slice(0, newline)) }
})

export const sdkPages = [
  { slug:"getting-started", title:"Getting started", description:"Understand the SDK, configure your environment and send your first payment.", indices:[0,1,2,3] },
  { slug:"authority-and-intents", title:"Authority & intents", description:"Read live permissions and bind an action to a precise scope, nonce and deadline.", indices:[4,5] },
  { slug:"manifests", title:"Action manifests", description:"Turn contract metadata into typed calls and agent tools.", indices:[6] },
  { slug:"transaction-lifecycle", title:"Transaction lifecycle", description:"Prepare once, inspect simulation, submit and reconcile the result.", indices:[7,8,9] },
  { slug:"identity-and-revocation", title:"Identity & revocation", description:"Resolve agent identities and observe live authority changes.", indices:[10,11] },
  { slug:"frame-builder", title:"Frame builder", description:"Inspect the transaction envelope and customize low-level frame construction.", indices:[12] },
  { slug:"integration-and-errors", title:"Integration & recovery", description:"Integrate agent processes, interpret failures and operate reliably.", indices:[13,14,16] },
  { slug:"api-reference", title:"API reference", description:"Find the methods and implementation modules used by your integration.", indices:[15] },
]

function Highlight({ source, language }: { source:string;language:string }) {
  if(language === "text") return <code>{source}</code>
  const tokens=source.split(/(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|export|const|let|new|async|await|function|return|if|else|throw|try|catch|type|interface|true|false|null|undefined|as|typeof)\b|\b\d[\d_]*(?:\.\d+)?n?\b|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\];,.])/g)
  return <code>{tokens.map((token,index)=>{
    const kind=/^(\/\/|#)/.test(token)?"comment":/^["'`]/.test(token)?"string":/^\d/.test(token)?"number":/^(import|from|export|const|let|new|async|await|function|return|if|else|throw|try|catch|type|interface|true|false|null|undefined|as|typeof)$/.test(token)?"keyword":/^[{}()[\];,.]$/.test(token)?"punctuation":/^[A-Za-z_$][\w$]*$/.test(token)?"function":"plain"
    return <span key={index} className={`sdk-token-${kind}`}>{token}</span>
  })}</code>
}

function Inline({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part)}</>
}
export function CodeExample({ language, source }: { language: string; source: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setError(false)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { setError(true) }
  }
  return <div className={`sdk-code-example cornered ${language === "bash" || language === "text" ? "sdk-code-green" : "sdk-code-cyan"}`}><CornerMarkers/><div className="sdk-code-toolbar"><span>{language || "Example"}</span><button type="button" onClick={copy} aria-label="Copy code example">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? "Copied" : error ? "Try copying again" : "Copy"}</button></div><pre><Highlight source={source} language={language}/></pre></div>
}
function Content({ source }: { source: string }) {
  const nodes: ReactNode[] = []
  const lines = source.trim().split("\n")
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    if (line.startsWith("```")) {
      const language = line.slice(3)
      const code: string[] = []
      index++
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++])
      index++
      nodes.push(<CodeExample key={nodes.length} language={language} source={code.join("\n")}/> )
    } else if (line.startsWith("|")) {
      const rows: string[][] = []
      while (index < lines.length && lines[index].startsWith("|")) rows.push(lines[index++].split("|").slice(1, -1).map(cell => cell.trim()))
      nodes.push(<div className="docs-table-frame cornered" key={nodes.length}><CornerMarkers/><div className="sdk-table-scroll"><table><thead><tr>{rows[0].map((cell,i)=><th key={i} scope="col"><Inline text={cell}/></th>)}</tr></thead><tbody>{rows.slice(2).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}><Inline text={cell}/></td>)}</tr>)}</tbody></table></div></div>)
    } else {
      const paragraph: string[] = []
      while (index < lines.length && lines[index].trim() && !lines[index].startsWith("```") && !lines[index].startsWith("|")) paragraph.push(lines[index++])
      nodes.push(<p key={nodes.length}><Inline text={paragraph.join(" ")}/></p>)
    }
  }
  return <>{nodes}</>
}

function SdkDiagram({slug}: {slug:string}) {
  const diagrams:Record<string,{title:string;labels:string[];code:string[]}>={
    "getting-started":{title:"From configuration to a first action",labels:["Configure client","Build intent","Simulate → submit"],code:["new AxonClient(config)","client.buildIntent()","Reuse prepared bytes"]},
    "authority-and-intents":{title:"The intent is bounded by live authority",labels:["Live grant","Bounded intent","Account checks"],code:["getGrant() + isAllowed()","Scope · nonce · deadline","VERIFY → SENDER"]},
    manifests:{title:"Contract metadata becomes an agent tool",labels:["Annotated contract","Action manifest","Typed calldata"],code:["ABI + deployment","findAction()","coerceArgs() → encode"]},
    "transaction-lifecycle":{title:"One prepared transaction, two consumers",labels:["Build + sign once","Inspect simulation","Submit exact payload"],code:["client.prepare(intent)","{ prepared }","{ prepared }"]},
    "identity-and-revocation":{title:"Identity names the agent; the registry permits it",labels:["ENS identity","Live registry","Validate intent"],code:["axon.account + agentKey","Owner updates grant","Fresh hash required"]},
    "frame-builder":{title:"An envelope encapsulates two account calls",labels:["Signed envelope","Frame 0 · VERIFY","Frame 1 · SENDER"],code:["Agent signature + nonce","validate(encodedIntent)","execute(encodedIntent)"]},
    "integration-and-errors":{title:"Keep orchestration inside the authority boundary",labels:["Agent proposes","Simulate + review","Submit or recover"],code:["Manifest action + args","Inspect both frames","Reconcile hash + nonce"]},
    "api-reference":{title:"The SDK layers",labels:["Action metadata","Client orchestration","Frame encoding"],code:["manifest.ts","client.ts","builder.ts + frame/"]},
  }
  const diagram=diagrams[slug]
  if(slug==="frame-builder") return <figure className="sdk-concept-diagram cornered"><CornerMarkers/><figcaption>One signed envelope contains two frames. Each frame carries the same encoded intent.</figcaption><svg viewBox="0 0 720 300" role="img" aria-label="Signed transaction envelope containing VERIFY validate intent and SENDER execute intent, with agent signature and nonce">
    <rect className="sdk-svg-envelope" x="8" y="8" width="704" height="280"/>
    <text className="sdk-svg-title" x="28" y="38">Signed EIP-8141 transaction</text>
    <text className="sdk-svg-caption" x="28" y="61">Agent signature · chain ID · envelope nonce · fee limits</text>
    {[{x:28,title:"Frame 0 · VERIFY",call:"validate(encodedIntent)",detail:"Live grant + scope + signer"},{x:375,title:"Frame 1 · SENDER",call:"execute(encodedIntent)",detail:"Time + budget + target call"}].map(frame=><g key={frame.title} transform={`translate(${frame.x} 85)`}>
      <rect className="sdk-svg-node" width="315" height="180"/><rect className="sdk-svg-accent" width="315" height="4"/>
      <text className="sdk-svg-title" x="16" y="31">{frame.title}</text><text className="sdk-svg-code" x="16" y="56">{frame.call}</text>
      <rect className="sdk-svg-envelope" x="14" y="75" width="287" height="55"/>
      <text className="sdk-svg-caption" x="26" y="97">Intent</text><text className="sdk-svg-code" x="26" y="115">target · selector · args · nonce · grantHash</text>
      <text className="sdk-svg-caption" x="16" y="157">{frame.detail}</text>
    </g>)}<path className="sdk-svg-wire" d="M343 175 H374 m-5 -4 5 4 -5 4"/>
  </svg></figure>
  return <figure className="sdk-concept-diagram cornered"><CornerMarkers/><figcaption>{diagram.title}</figcaption><svg viewBox="0 0 720 190" role="img" aria-label={`${diagram.title}: ${diagram.labels.join(" to ")}`}>
    <rect className="sdk-svg-envelope" x="8" y="12" width="704" height="164"/>
    <text className="sdk-svg-caption" x="24" y="36">{slug==="frame-builder"?"EIP-8141 frame transaction":"Application / agent integration"}</text>
    {diagram.labels.map((label,index)=><g key={label} transform={`translate(${24+index*232} 61)`}><rect className="sdk-svg-node" width="208" height="88"/><rect className="sdk-svg-accent" width="208" height="4"/><text className="sdk-svg-title" x="13" y="33">{label}</text><text className="sdk-svg-code" x="13" y="60">{diagram.code[index]}</text>{index<2&&<path className="sdk-svg-wire" d="M208 44 H231 m-5 -4 5 4 -5 4"/>}</g>)}
  </svg></figure>
}

export function SdkDocumentation({slug="getting-started"}: {slug?:string}) {
  const page=sdkPages.find(page=>page.slug===slug)??sdkPages[0]
  return <section id="sdk" className="ds-section sdk-guide">
    <span className="eyebrow">SDK / {page.title}</span>
    <h1 className="display mt-5">{page.title}</h1>
    <p className="sdk-lead">{page.description}</p>
    <SdkDiagram slug={page.slug}/>
    {page.indices.map(index=>{const section=sdkSections[index];return <section id={section.id} className="sdk-guide-section" key={section.id}><h2>{section.title.replace(/^\d+\.\s*/,"")}</h2><Content source={section.body}/></section>})}
  </section>
}

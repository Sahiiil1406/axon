import { WorkspaceFish } from "@/components/workspace-fish"
import { ArchitectureOverview, architectureSections } from "@/components/architecture-overview"
import { DocsQuickStart, quickStartSections } from "@/components/docs-quick-start"
import { DocumentationTopic, documentationTopics } from "@/components/documentation-topics"
import { SdkDocumentation, sdkPages, sdkSections } from "@/components/sdk-documentation"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { useEffect, useState } from "react"
import { Link, Navigate, useLocation } from "react-router-dom"
import {
  Code2,
  ArrowRight,
  ArrowUpRight,
  Fingerprint,
  KeyRound,
  Layers3,
  Network,
  ShieldCheck,
  ShieldX,
} from "lucide-react"
import { ActionLink } from "@/components/brand/primitives"
export function Docs() {
  const { hash, pathname } = useLocation()
  const [activeHeading,setActiveHeading]=useState("")
  const requestedPage = pathname.split("/").filter(Boolean).slice(1).join("/")
  const page = requestedPage.startsWith("architecture/") ? requestedPage.slice("architecture/".length) : requestedPage
  const isQuickStart = page === "quick-start" || page === ""
  const docsHref=(slug:string)=>["architecture","grants","scope","protocol","revocation","permission-layer","alt-mempool","guardrails"].includes(slug)?`/docs/architecture${slug==="architecture"?"":`/${slug}`}`:`/docs/${slug}`
  const sdkPage = sdkPages.find(item=>`sdk/${item.slug}`===page || (page === "api-reference" && item.slug === "api-reference"))
  const foundations = [
    {label:"Overview",slug:"architecture",id:"architecture",icon:Layers3},
    {label:"Permission grants",slug:"grants",id:"grants",icon:KeyRound},
    {label:"Scope & intent",slug:"scope",id:"scope",icon:Fingerprint},
    {label:"Protocol rules",slug:"protocol",id:"protocol",icon:ShieldCheck},
    {label:"Revocation",slug:"revocation",id:"revocation",icon:ShieldX},
  ]
  const topic=documentationTopics.find(item=>item.slug===page)
  const current=foundations.find(item=>item.slug===page)
  const toc=isQuickStart?quickStartSections:current?.id==="architecture"?architectureSections:topic?topic.sections.map(section=>({id:section.id,label:section.title})):sdkPage?sdkPage.indices.map(index=>({id:sdkSections[index].id,label:sdkSections[index].title.replace(/^\d+\.\s*/,"")})):[{id:current?.id??"architecture",label:current?.label??"Architecture"}]
  const sidebarItems=[
    {label:"Quick start",href:"/docs/quick-start",icon:Layers3,active:isQuickStart,group:"Get started",subgroup:"Introduction"},
    {label:"Installation & first payment",href:"/docs/sdk/getting-started",icon:Code2,active:page==="sdk/getting-started",group:"Get started",subgroup:"SDK setup"},
    ...foundations.map(item=>({label:item.label,href:docsHref(item.slug),icon:item.icon,active:page===item.slug,group:"Architecture",subgroup:["grants","scope","revocation"].includes(item.slug)?"Owner authority":item.slug==="protocol"?"Execution":"Overview"})),
    ...documentationTopics.map(item=>({label:item.title,href:docsHref(item.slug),icon:item.slug==="alt-mempool"?Network:Layers3,active:page===item.slug,group:["developers","playground"].includes(item.slug)?"Guides & examples":"Architecture",subgroup:item.slug==="permission-layer"?"Owner authority":item.slug==="guardrails"?"Enforcement":item.slug==="alt-mempool"?"Execution":"Application guides"})),
    ...sdkPages.filter(item=>!["getting-started","api-reference"].includes(item.slug)).map(item=>({label:item.title,href:`/docs/sdk/${item.slug}`,icon:Code2,active:sdkPage?.slug===item.slug,group:"SDK guides",subgroup:["authority-and-intents","manifests"].includes(item.slug)?"Build actions":["transaction-lifecycle","frame-builder"].includes(item.slug)?"Transactions":"Integration"})),
    {label:"SDK API",href:"/docs/api-reference",icon:Code2,active:sdkPage?.slug==="api-reference",group:"API reference",subgroup:"TypeScript SDK"},
  ].sort((a,b)=>{
    const groups=["Get started","Architecture","SDK guides","Guides & examples","API reference"]
    const groupOrder=groups.indexOf(a.group)-groups.indexOf(b.group)
    if(groupOrder)return groupOrder
    const subgroups=["Introduction","SDK setup","Overview","Owner authority","Enforcement","Execution","Build actions","Transactions","Integration","Application guides","TypeScript SDK"]
    return subgroups.indexOf(a.subgroup)-subgroups.indexOf(b.subgroup)
  })
  const allPages=sidebarItems.map(item=>({href:item.href,label:item.label}))
  const pageIndex=allPages.findIndex(item=>item.href===pathname.replace(/\/$/,""))
  useEffect(()=>{
    const update=()=>{
      const headings=Array.from(document.querySelectorAll<HTMLElement>(".docs-article section[id]"))
      const passed=headings.filter(element=>element.getBoundingClientRect().top<180)
      setActiveHeading((passed.at(-1)??headings[0])?.id??"")
    }
    update()
    window.addEventListener("scroll",update,{passive:true})
    return()=>window.removeEventListener("scroll",update)
  },[pathname])
  // Preserve links shared before the documentation was split into pages.
  if(pathname==="/docs"&&hash){
    const old=hash.slice(1)
    if(old==="sdk")return <Navigate replace to="/docs/sdk/getting-started"/>
    const oldSdk=sdkPages.find(item=>item.indices.some(index=>sdkSections[index].id===old))
    if(oldSdk)return <Navigate replace to={`/docs/sdk/${oldSdk.slug}${hash}`}/>
    if(old==="architecture")return <Navigate replace to="/docs/architecture"/>
    if(foundations.some(item=>item.slug===old))return <Navigate replace to={docsHref(old)}/>
  }
  if(page === "")return <Navigate replace to="/docs/quick-start"/>
  if(page === "sdk/api-reference")return <Navigate replace to="/docs/api-reference"/>
  if(!requestedPage.startsWith("architecture/") && ["grants","scope","protocol","revocation","permission-layer","alt-mempool","guardrails"].includes(page))return <Navigate replace to={`${docsHref(page)}${hash}`}/>
  if(page === "sdk")return <Navigate replace to="/docs/sdk/getting-started"/>
  if(!isQuickStart&&!current&&!sdkPage&&!topic)return <Navigate replace to="/docs"/>
  return (
    <div className="docs-workspace axon-docs">
        <WorkspaceFish page={pathname}/>

      <WorkspaceSidebar
        label="Documentation"
        items={sidebarItems}
        resources={[
          { label: "Live console", href: "/app", icon: ArrowUpRight },
          {
            label: "Policy playground",
            href: "/#playground",
            icon: ArrowUpRight,
          },
        ]}
      />
      <article className="docs-article">
        {isQuickStart && <DocsQuickStart/>}
        {current?.id === "architecture" && <ArchitectureOverview/>}
        {current?.id === "grants" && <section id="grants" className="ds-section">
          <h1 className="display mb-7">Permission grants</h1>
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
        </section>}
        {current?.id === "scope" && <section id="scope" className="ds-section">
          <h1 className="display mb-7">Scope & intent</h1>
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
        </section>}
        {current?.id === "protocol" && <section id="protocol" className="ds-section">
          <h1 className="display mb-7">Protocol rules</h1>
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
        </section>}
        {current?.id === "revocation" && <section id="revocation" className="ds-section">
          <h1 className="display mb-7">Live revocation</h1>
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
        </section>}
        {topic && <DocumentationTopic slug={topic.slug}/>}
        {sdkPage && <SdkDocumentation slug={sdkPage.slug}/>}
        <nav className="docs-page-navigation" aria-label="Documentation pages">
          {pageIndex>0?<Link to={allPages[pageIndex-1].href}><small>Previous</small>{allPages[pageIndex-1].label}</Link>:<span/>}
          {pageIndex<allPages.length-1&&<Link to={allPages[pageIndex+1].href}><small>Next</small>{allPages[pageIndex+1].label}<ArrowRight size={15}/></Link>}
        </nav>
      </article>
      <aside className="docs-minimap" aria-label="On this page">
        <p>On this page</p>
        <nav>{toc.map(item=><a key={item.id} href={`#${item.id}`} className={activeHeading===item.id?"is-active":""} aria-current={activeHeading===item.id?"location":undefined}><i/><span>{item.label}</span></a>)}</nav>
        <span className="docs-minimap-caption">{isQuickStart?"Quick start":sdkPage?.slug==="api-reference"?"API reference":sdkPage?"SDK integration":topic?.group??"Architecture"}</span>
      </aside>
    </div>
  )
}

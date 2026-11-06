import type { CSSProperties } from "react"
import { AsciiSharks, type SharkKind, type SharkSpec } from "./ascii-sharks"

const kinds:SharkKind[]=["classic","hammerhead","mako","thresher","zebra","tiger","greathammer","nurse"]
const rosters:SharkSpec[][]=kinds.map(kind=>[{kind,size:1}])
const routes=["/docs/quick-start","/docs/architecture","/docs/architecture/permission-layer","/docs/architecture/grants","/docs/architecture/scope","/docs/architecture/revocation","/docs/architecture/guardrails","/docs/architecture/alt-mempool","/docs/architecture/protocol","/docs/developers","/docs/playground","/docs/sdk/getting-started","/docs/sdk/authority-and-intents","/docs/sdk/manifests","/docs/sdk/transaction-lifecycle","/docs/sdk/identity-and-revocation","/docs/sdk/frame-builder","/docs/sdk/integration-and-errors","/docs/api-reference","/app","/app/agents","/app/permissions","/app/activity","/app/profile"]

/** A stable, still species and pose per page, shared by docs and the console. */
export function WorkspaceFish({page}: {page:string}){
  const known=routes.indexOf(page)
  const index=known>=0?known:Array.from(page).reduce((sum,char)=>sum+char.charCodeAt(0),0)
  const kind=index%kinds.length
  const style={"--workspace-fish-angle":`${[-28,-19,-34,-12,-24,-37,-17,-30][kind]}deg`,"--workspace-fish-scale":[1,.91,1.08,.95,1.04,.88,1.1,.98][kind],"--workspace-fish-shift":`${[-12,15,-20,8,-5,20,-15,5][kind]}px`} as CSSProperties
  return <div className="docs-main-shark workspace-main-fish" style={style} aria-hidden="true" data-fish-kind={kinds[kind]}><AsciiSharks static sharks={rosters[kind]} className="docs-main-shark-canvas"/></div>
}

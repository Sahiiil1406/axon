import { Link } from "react-router-dom"
import { AxonHeader } from "./brand/axon-shell"
import "./workspace-header.css"

export function WorkspaceHeader({ page, rootHref = "/app" }: { page: string; rootHref?: string }) {
  return <div className="workspace-site-navbar">
    <AxonHeader context={<nav className="workspace-header-route" aria-label="Breadcrumb">
      <Link to={rootHref}>Axon</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{page}</span>
    </nav>} />
  </div>
}

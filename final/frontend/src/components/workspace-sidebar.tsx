import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { SidebarShark } from "./sidebar-shark"
import { SiteLink } from "./site-link"
import "./workspace-sidebar.css"

export interface SidebarItem {
  label: string
  href: string
  icon: LucideIcon
  active?: boolean
  badge?: ReactNode
}
export function WorkspaceSidebar({
  label,
  items,
  resources,
  graphic = <SidebarShark />,
  className = "",
}: {
  label: string
  items: SidebarItem[]
  graphic?: ReactNode
  resources?: SidebarItem[]
  className?: string
}) {
  return (
    <aside className={`workspace-sidebar ${className}`}>
      <p className="workspace-sidebar-label">{label}</p>
      <nav aria-label={`${label} navigation`}>
        {items.map(({ label: text, href, icon: Icon, active, badge }) => (
          <SiteLink
            key={href}
            href={href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={17} />
            <span>{text}</span>
            {badge !== undefined && (
              <span className="workspace-sidebar-badge">{badge}</span>
            )}
          </SiteLink>
        ))}
      </nav>
      {resources && (
        <div className="workspace-sidebar-resources">
          {graphic}
          <p className="workspace-sidebar-label">Resources</p>
          {resources.map(({ label: text, href, icon: Icon }) => (
            <SiteLink
              key={href}
              href={href}
              {...(href.startsWith("https:")
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              <span>{text}</span>
              <Icon size={14} />
            </SiteLink>
          ))}
        </div>
      )}
    </aside>
  )
}

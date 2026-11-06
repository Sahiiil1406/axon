import type { LucideIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { SidebarShark } from "./sidebar-shark"
import { SiteLink } from "./site-link"
import "./workspace-sidebar.css"

export interface SidebarItem {
  label: string
  href: string
  icon: LucideIcon
  active?: boolean
  group?: string
  subgroup?: string
  badge?: ReactNode
}
export function WorkspaceSidebar({
  label,
  items,
  resources,
  bottom,
  graphic = <SidebarShark />,
  className = "",
}: {
  label: string
  items: SidebarItem[]
  bottom?: ReactNode
  graphic?: ReactNode
  resources?: SidebarItem[]
  className?: string
}) {
  const [scrolling,setScrolling]=useState(false)
  const scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current)},[])
  function onScroll(){
    setScrolling(true)
    if(scrollTimer.current)clearTimeout(scrollTimer.current)
    scrollTimer.current=setTimeout(()=>setScrolling(false),800)
  }
  return (
    <aside className={`workspace-sidebar ${className} ${scrolling ? "is-scrolling" : ""}`} onScroll={onScroll}>
      <p className="workspace-sidebar-label">{label}</p>
      <nav aria-label={`${label} navigation`}>
        {items.map(({ label: text, href, icon: Icon, active, badge, group, subgroup }, index) => (
          <Fragment key={href}>
          {group && group !== items[index-1]?.group && <h2 className="sidebar-category">{group}</h2>}
          <SiteLink
            key={href}
            href={href}
            className={`${active ? "active" : ""}${subgroup ? " sidebar-nested-link" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={17} />
            <span>{text}</span>
            {badge !== undefined && (
              <span className="workspace-sidebar-badge">{badge}</span>
            )}
          </SiteLink>
          </Fragment>
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
      {bottom && <div className="workspace-sidebar-bottom">{bottom}</div>}
    </aside>
  )
}

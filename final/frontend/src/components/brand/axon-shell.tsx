import { sdkPages } from "@/components/sdk-documentation"
import { ThemeToggle } from "@/components/theme-toggle"
import { SiteLink } from "@/components/site-link"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react"
import { ActionLink, Logo } from "./primitives"

const groups = {
  Protocol: [
    {category:"Architecture",label:"Architecture",href:"/docs/architecture",detail:"From delegated intent to guarded execution"},
    {category:"Permission layer",label:"Permission layer",href:"/docs/permission-layer",detail:"How delegated authority works"},
    {category:"Permission layer",label:"Permission grants",href:"/docs/grants",detail:"Signer, budget, epoch and expiry"},
    {category:"Permission layer",label:"Scope & intent",href:"/docs/scope",detail:"Targets, selectors and bounded actions"},
    {category:"Permission layer",label:"Guardrails",href:"/docs/guardrails",detail:"Budget, scope and revocation explained"},
    {category:"Permission layer",label:"Live revocation",href:"/docs/revocation",detail:"Current registry state governs authority"},
    {category:"Execution",label:"Alt mempool",href:"/docs/alt-mempool",detail:"Admission built for live authority"},
    {category:"Execution",label:"Protocol rules",href:"/docs/protocol",detail:"Contract-owned action boundaries"},
  ],
  Docs: [
    {category:"Build & explore",label:"Quick start",href:"/docs/quick-start",detail:"A simple introduction, installation and first action"},
    {category:"Build & explore",label:"Developer integration",href:"/docs/developers",detail:"Integrate an agent-native application"},
    {category:"Build & explore",label:"Policy playground",href:"/docs/playground",detail:"Examples and local policy checks"},
    ...sdkPages.map((page,index)=>({category:index<4?"SDK · Foundations":"SDK · Advanced",label:page.title,href:page.slug==="api-reference"?"/docs/api-reference":`/docs/sdk/${page.slug}`,detail:page.description})),
    {category:"Build & explore",label:"Design system",href:"/design-system",detail:"Tokens, components and patterns"},
  ],
}
export function AxonHeader({ context }: { context?: ReactNode }) {
  const headerRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLElement>(null)
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  const [open, setOpen] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [highlight, setHighlight] = useState({ x: 0, width: 0, visible: false })
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const showMenu = (name: string | null) => {
    cancelClose()
    setOpen(name)
  }
  const highlightLink = (
    event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>
  ) => {
    const target = event.currentTarget
    setHighlight({
      x: target.offsetLeft - 10,
      width: target.offsetWidth + 20,
      visible: true,
    })
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    []
  )
  useLayoutEffect(() => {
    if (!open) return
    const positionMenu = () => {
      const header = headerRef.current
      const menu = menuRef.current
      if (!header || !menu) return
      const frame = header.getBoundingClientRect()
      const trigger = triggers.current[open]
      const mobile = open === "mobile" || !trigger?.getClientRects().length
      const width = Math.min(mobile ? 720 : 960, frame.width - 32)
      const anchor = mobile
        ? frame.width - width - 16
        : trigger!.getBoundingClientRect().left - frame.left - 16
      menu.style.width = `${width}px`
      menu.style.left = `${Math.max(16, Math.min(anchor, frame.width - width - 16))}px`
      menu.style.right = "auto"
      menu.style.top = `${frame.height}px`
    }
    positionMenu()
    const observer = new ResizeObserver(positionMenu)
    if (headerRef.current) observer.observe(headerRef.current)
    window.addEventListener("resize", positionMenu)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", positionMenu)
    }
  }, [open])
  return (
    <header
      ref={headerRef}
      className="site-header axon-header"
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return
        cancelClose()
        closeTimer.current = setTimeout(() => {
          setOpen(null)
          setHighlight((previous) => ({ ...previous, visible: false }))
        }, 160)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          showMenu(null)
          setHighlight((previous) => ({ ...previous, visible: false }))
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(null)
      }}
    >
      <Logo />
      {context}
      <nav aria-label="Main navigation" className="nav-links">
        <span
          className="nav-hover-highlight"
          aria-hidden="true"
          style={{
            width: highlight.width,
            transform: `translateX(${highlight.x}px)`,
            opacity: highlight.visible ? 1 : 0,
          }}
        />
        {Object.entries(groups).map(([name]) => (
          <button
            ref={(element) => {
              triggers.current[name] = element
            }}
            aria-expanded={open === name}
            aria-controls="axon-menu"
            key={name}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return
              highlightLink(event)
              showMenu(name)
            }}
            onFocus={(event) => {
              highlightLink(event)
              if (event.currentTarget.matches(":focus-visible")) showMenu(name)
            }}
            onClick={() => showMenu(name)}
          >
            {name}
            <ChevronDown size={12} />
          </button>
        ))}
      </nav>
      <div className="nav-actions">
        {/* <span className="devnet-label">
          <i /> EIP-8141 prototype
        </span> */}
        <ActionLink href="/app" variant="outline">
          View demo <ArrowUpRight size={14} />
        </ActionLink>
        <button
          className="mobile-toggle"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={!!open}
          onClick={() => setOpen(open ? null : "mobile")}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <nav
        ref={menuRef}
        id="axon-menu"
        className="surface nav-dropdown"
        data-open={!!open}
        aria-hidden={!open}
        inert={!open}
        aria-label={`${open ?? "Protocol"} navigation`}
      >
        <div className="nav-dropdown-content" key={open}>
          {Array.from(new Set((open === "mobile" ? Object.values(groups).flat() : (groups[open as keyof typeof groups] ?? [])).map(item=>item.category))).map(category=><section className="nav-dropdown-group" key={category}>
            <h2>{category}</h2>
            {(open === "mobile" ? Object.values(groups).flat() : (groups[open as keyof typeof groups] ?? [])).filter(item=>item.category===category).map(item=><SiteLink href={item.href} key={item.href} onClick={()=>setOpen(null)}>
              <span className="flex justify-between">{item.label}<ArrowUpRight size={15}/></span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
            </SiteLink>)}
          </section>)}
        </div>
      </nav>
    </header>
  )
}
export function AxonFooter() {
  return (
    <footer className="footer axon-footer container-shell">
      <div className="footer-top">
        <div>
          <Logo />
          <p className="mt-5 max-w-60 text-sm text-muted-foreground">
            The permission layer for an agentic Ethereum.
          </p>
          <span className="eyebrow mt-5 block">Autonomy, with boundaries.</span>
        </div>
        {[
          {
            title: "Protocol",
            links: [
              ["Architecture", "/#architecture"],
              ["Alt mempool", "/#alt-mempool"],
              ["Permissions", "/#permissions"],
              ["Guardrails", "/#guardrails"],
            ],
          },
          {
            title: "Build",
            links: [
              ["Technical overview", "/docs"],
              ["Policy playground", "/#playground"],
              ["Integration model", "/#developers"],
              ["Design system", "/design-system"],
            ],
          },
          {
            title: "Foundations",
            links: [
              ["Live grants", "/docs#grants"],
              ["Scoped authority", "/docs#scope"],
              ["Protocol checks", "/docs#protocol"],
              ["Revocation", "/docs#revocation"],
            ],
          },
        ].map((group) => (
          <div key={group.title}>
            <h3 className="text-sm">{group.title}</h3>
            {group.links.map(([name, href]) => (
              <SiteLink key={name} href={href}>
                {name}
              </SiteLink>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <ThemeToggle />
        <span>© {new Date().getFullYear()} Axon</span>
        <span>Agent-native permissions. Owner-defined authority.</span>
        <SiteLink
          href="/design-system"
          style={{ display: "inline", margin: 0 }}
        >
          Design system <ArrowUpRight size={12} className="inline" />
        </SiteLink>
      </div>
    </footer>
  )
}

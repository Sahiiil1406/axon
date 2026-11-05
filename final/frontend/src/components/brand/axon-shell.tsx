import { SiteLink } from "@/components/site-link"
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react"
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react"
import { ActionLink, Logo } from "./primitives"

const groups = {
  Protocol: [
    {
      label: "Architecture",
      href: "/#architecture",
      detail: "From delegated intent to guarded execution",
    },
    {
      label: "Permission layer",
      href: "/#permissions",
      detail: "Budgets, scopes, and live revocation",
    },
    {
      label: "Alt mempool",
      href: "/#alt-mempool",
      detail: "Validation built for live authority",
    },
  ],
  Developers: [
    {
      label: "Technical overview",
      href: "/docs",
      detail: "Explore the account and registry model",
    },
    {
      label: "Policy playground",
      href: "/#playground",
      detail: "See a permission check in action",
    },
    {
      label: "Design system",
      href: "/design-system",
      detail: "Tokens, components, and patterns",
    },
  ],
} as const
export function AxonHeader() {
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
  return (
    <header
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
        {[
          ["Guardrails", "/#guardrails"],
          ["Docs", "/docs"],
        ].map(([label, href]) => (
          <SiteLink
            key={label}
            href={href}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") {
                highlightLink(event)
                showMenu(null)
              }
            }}
            onFocus={(event) => {
              highlightLink(event)
              showMenu(null)
            }}
            onClick={() => showMenu(null)}
          >
            {label}
          </SiteLink>
        ))}
      </nav>
      <div className="nav-actions">
        <span className="devnet-label">
          <i /> EIP-8141 prototype
        </span>
        <ActionLink href="/#playground" variant="outline">
          Explore Axon <ArrowUpRight size={14} />
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
        id="axon-menu"
        className="surface nav-dropdown"
        data-open={!!open}
        aria-hidden={!open}
        inert={!open}
        aria-label={`${open ?? "Protocol"} navigation`}
      >
        <div className="nav-dropdown-content" key={open}>
          {(open === "mobile"
            ? Object.values(groups).flat()
            : (groups[open as keyof typeof groups] ?? [])
          ).map((item) => (
            <SiteLink
              href={item.href}
              key={item.label}
              onClick={() => setOpen(null)}
            >
              <span className="flex justify-between">
                {item.label}
                <ArrowUpRight size={15} />
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {item.detail}
              </span>
            </SiteLink>
          ))}
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

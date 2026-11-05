import { Link } from "react-router-dom"
import type { AnchorHTMLAttributes, ReactNode } from "react"
import { ArrowUpRight, Check, Copy, RefreshCw } from "lucide-react"
import { useState } from "react"
import { ReferenceFrame } from "@/components/brand/reference-frame"
import { Button } from "@/components/ui/button"
import { useConsole } from "./model"
import { EXPLORER, short } from "./format"
import type { Tone } from "./types"

export function ConsoleLink({
  href = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link to={href} {...props} />
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: Tone
}) {
  return <span className={`console-badge ${tone}`}>{children}</span>
}
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
  id,
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <ReferenceFrame className={`console-panel ${className}`}>
      <section id={id}>
        <header className="console-panel-head">
          <div>
            {eyebrow && <p className="console-eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          {action}
        </header>
        {children}
      </section>
    </ReferenceFrame>
  )
}
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
}) {
  return (
    <div className={`console-stat ${tone ?? ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub && <p>{sub}</p>}
    </div>
  )
}
export function DefinitionList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="console-kv">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}
export function ChainLink({
  value,
  type = "address",
  label,
}: {
  value?: string | null
  type?: "address" | "tx"
  label?: string
}) {
  return value ? (
    <a
      className="console-chain-link"
      href={`${EXPLORER}/${type}/${encodeURIComponent(value)}`}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {label ?? short(value, type === "tx" ? 8 : 6, type === "tx" ? 6 : 4)}
      <ArrowUpRight size={12} />
    </a>
  ) : (
    <>—</>
  )
}
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <button
      type="button"
      className="console-copy"
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setFailed(false)
        } catch {
          setFailed(true)
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span className={failed ? "" : "sr-only"} role="status">
        {failed ? "Copy unavailable" : copied ? "Copied" : ""}
      </span>
    </button>
  )
}
export function RefreshButton({
  label = "Refresh state",
  onClick,
}: {
  label?: string
  onClick?: () => void
}) {
  const { refresh, loading, busy } = useConsole()
  return (
    <Button
      variant="outline"
      disabled={loading || !!busy}
      onClick={() => (onClick ? onClick() : void refresh())}
    >
      <RefreshCw size={14} className={loading ? "console-spin" : ""} />
      {loading ? "Refreshing…" : label}
    </Button>
  )
}
export function Empty({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="console-empty">
      <p>{title}</p>
      {children && <span>{children}</span>}
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="console-page-heading">
      <div>
        <p className="console-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {actions && <div className="console-heading-actions">{actions}</div>}
    </div>
  )
}

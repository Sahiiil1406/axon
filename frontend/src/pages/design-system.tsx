import { useState } from "react"
import { ArrowRight, Check, Copy, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReferenceFrame } from "@/components/brand/reference-frame"
import { FeatureCard } from "@/components/brand/primitives"
const colors = [
  ["Mint / primary", "--axon-mint", "#68F2C2"],
  ["Sky blue", "--axon-blue", "#59BFDE"],
  ["Teal", "--axon-teal", "#31A6C0"],
  ["Cyan", "--axon-cyan", "#57D8EB"],
  ["Aqua", "--axon-aqua", "#66EDE3"],
  ["Background", "--background", "#151414"],
  ["Foreground", "--foreground", "#F0E3DE"],
  ["Surface", "--card", "#191817"],
  ["Muted text", "--muted-foreground", "#9A9390"],
  ["Border", "--border", "#F0E3DE20"],
]
export function DesignSystem() {
  const [copied, setCopied] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="container-shell ds-layout">
      <aside className="ds-nav">
        <span className="eyebrow">Design system / 01</span>
        {[
          "Overview",
          "Color",
          "Typography",
          "Spacing",
          "Components",
          "Patterns",
        ].map((n) => (
          <a href={`#${n.toLowerCase()}`} key={n}>
            {n}
          </a>
        ))}
        <a href="/" className="mt-5 text-primary">
          ← Homepage
        </a>
      </aside>
      <div>
        <section id="overview" className="ds-section pt-0">
          <span className="eyebrow">Axon / design foundations</span>
          <h1 className="display mt-5">Authority by design.</h1>
          <p className="body-copy mt-6 max-w-2xl">
            Mint, blue, teal, cyan, and aqua accents. Familiar gray surfaces,
            clear boundaries, and a visual language built around explicit
            authority.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Axon’s shared tokens connect the homepage, protocol overview, and
            reusable components. Neutral backgrounds and text stay gray; the
            five brand colors define accents, signals, and actions.
          </p>
        </section>
        <section id="color" className="ds-section">
          <h2>01 / Color</h2>
          <p className="body-copy mb-7">
            Semantic variables power both shadcn components and page patterns.
            Select a swatch to copy its CSS variable.
          </p>
          <div className="swatches">
            {colors.map(([name, token, hex]) => (
              <button
                className="text-left"
                key={name}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`var(${token})`)
                    setCopied(token)
                  } catch {
                    setCopied("Copy unavailable")
                  }
                }}
              >
                <div className="swatch-color" style={{ background: hex }} />
                <div className="flex justify-between text-sm">
                  {name}
                  {copied === token ? <Check size={14} /> : <Copy size={14} />}
                </div>
                <div className="eyebrow mt-1">
                  {hex} · {token}
                </div>
              </button>
            ))}
          </div>
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            {copied
              ? copied === "Copy unavailable"
                ? copied
                : `Copied var(${copied})`
              : "Click a color to copy its token."}
          </p>
        </section>
        <section id="typography" className="ds-section">
          <h2>02 / Typography</h2>
          <p className="eyebrow mb-6">
            STK Bureau Sans · system sans-serif fallback
          </p>
          <div className="display">Keep authority yours.</div>
          <div className="section-title my-7">Every action has a boundary.</div>
          <p className="body-copy">
            Readable body copy, generous leading, and purposeful hierarchy.
          </p>
          <p className="eyebrow mt-7">
            Eyebrow / monospace / 11px / tracking 0.13em
          </p>
        </section>
        <section id="spacing" className="ds-section">
          <h2>03 / Spacing & shape</h2>
          <div className="component-row">
            {[4, 8, 16, 24, 32, 48, 64].map((n) => (
              <div key={n} className="text-center">
                <div
                  style={{
                    width: n,
                    height: 32,
                    background: "var(--primary)",
                    marginBottom: 10,
                  }}
                />
                <span className="eyebrow">{n}</span>
              </div>
            ))}
          </div>
          <p className="body-copy">
            Use a 4px base rhythm and generous section spacing. Panels keep
            sharp edges, actions use a 2px radius, and small square anchors
            define the corners of bordered components.
          </p>
        </section>
        <section id="components" className="ds-section">
          <h2>04 / Components</h2>
          <p className="eyebrow">Actions / shared shadcn Button</p>
          <div className="component-row">
            <Button onClick={() => setCopied("Primary action clicked")}>
              Primary <ArrowRight />
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCopied("Secondary action clicked")}
            >
              Secondary
            </Button>
            <Button
              variant="outline"
              onClick={() => setCopied("Outline action clicked")}
            >
              Outline
            </Button>
            <Button
              variant="ghost"
              onClick={() => setCopied("Ghost action clicked")}
            >
              Ghost
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {copied.endsWith("clicked") ? copied : ""}
          </p>
          <form
            className="surface mt-8 max-w-lg p-7"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(true)
            }}
          >
            <label htmlFor="email" className="mb-2 block text-sm">
              Email address
            </label>
            <input
              id="email"
              className="field"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setSubmitted(false)
              }}
              required
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Component preview only. No information is sent.
            </p>
            <label className="my-6 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 accent-primary"
              />
              Enable notifications
            </label>
            <Button type="submit">Preview submission</Button>
            {submitted && (
              <p role="status" className="mt-4 text-sm">
                Valid email. Preview complete.
              </p>
            )}
          </form>
        </section>
        <section id="patterns" className="ds-section">
          <h2>05 / Reusable patterns</h2>
          <div className="reference-rails mb-8">
            <ReferenceFrame>
              <div className="p-8">
                <h3 className="mb-3 text-xl">Edges are part of the system.</h3>
                <p className="body-copy">
                  1200px content rails inside a 1480px outer grid. Dashes repeat
                  every 32px; dot patterns repeat every 12px. Each corner marker
                  is centered on the border intersection with a 1px radius.
                </p>
              </div>
            </ReferenceFrame>
          </div>
          <FeatureCard
            icon={<ShieldCheck />}
            title="A consistent foundation"
            href="/"
          >
            FeatureCard combines an icon, heading, body text, and optional
            action. Use SectionHeading, ActionLink, TextLink, and
            container-shell to compose new pages.
          </FeatureCard>
          <div className="surface mt-6 p-6">
            <p className="eyebrow mb-3">Usage</p>
            <pre className="overflow-auto text-xs leading-6">{`<SectionHeading title="Authority, made explicit">\n  A short, clear supporting statement.\n</SectionHeading>\n<ActionLink href="/#playground">Explore Axon</ActionLink>`}</pre>
          </div>
        </section>
      </div>
    </div>
  )
}
